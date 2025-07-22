from flask import Flask, Response, render_template, request, redirect, send_from_directory, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from functools import wraps
import os
import base64
import face_recognition
import numpy as np
import requests
import datetime
import random
import csv
import io
import re
import pandas as pd
import smtplib
from email.message import EmailMessage
from pymongo import MongoClient
from dotenv import load_dotenv
import shutil
import click
import time
import logging # Import logging module
from bson.objectid import ObjectId # Import ObjectId for querying by _id

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Use a strong, unique secret key from environment variables
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key-change-me") # Add a default for development

# --- File Upload and Path Configuration ---
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['TEMP_UPLOAD_FOLDER'] = 'static/uploads/temp' # Corrected path
app.config['SHARED_LOADER_PATH'] = 'shared_loader_data'
app.config['ALLOWED_EXTENSIONS'] = {'csv', 'xlsx'}


# MongoDB Configuration
mongo_client = MongoClient(os.getenv("MONGO_URI"))
mongo_db = mongo_client["face_recognition_data"]

# MongoDB Collections
users_collection = mongo_db["users"]
attendance_collection = mongo_db["attendance"]
admins_collection = mongo_db["admins"]
regularization_collection = mongo_db["attendance_regularization"]
password_reset_tokens = mongo_db["password_reset_tokens"]
leave_requests_collection = mongo_db["leave_requests"] # New: Leave Requests Collection

# --- Constants for Configuration and Validation ---
MIN_PASSWORD_LENGTH = 8
MIN_EMPLOYEE_ID_LENGTH = 3
MIN_ADMIN_ID_LENGTH = 3
MIN_ADMIN_PASSWORD_LENGTH = 8
FACE_RECOGNITION_TOLERANCE = 0.5 # Lower means stricter face match
BEST_MATCH_SCORE_THRESHOLD = 0.6 # Minimum confidence for auto-signin

# --- Helper Functions ---

def create_html_email(title, preheader, content_html):
    """
    Wraps content in a professional-looking HTML email template.
    """
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }}
        .container {{ max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); overflow: hidden; }}
        .header {{ background-color: #4a6da7; color: #ffffff; padding: 20px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ padding: 30px; color: #333333; line-height: 1.6; }}
        .content h2 {{ color: #4a6da7; }}
        .button {{ display: inline-block; padding: 12px 24px; margin: 20px 0; background-color: #4a6da7; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; }}
        .otp-code {{ font-size: 28px; font-weight: bold; color: #212529; text-align: center; margin: 20px 0; letter-spacing: 5px; padding: 15px; background-color: #f8f9fa; border: 1px dashed #dee2e6; border-radius: 5px; }}
        .footer {{ background-color: #f8f9fa; color: #6c757d; text-align: center; padding: 20px; font-size: 12px; }}
        .preheader {{ display: none; max-height: 0; overflow: hidden; }}
    </style>
</head>
<body>
    <span class="preheader">{preheader}</span>
    <div class="container">
        <div class="header">
            <h1>ArgusScan</h1>
        </div>
        <div class="content">
            {content_html}
        </div>
        <div class="footer">
            <p>&copy; {datetime.datetime.now().year} InnovaSolutions. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
"""

def send_email_with_retry(recipients, subject, html_body, retries=3, delay=5):
    """
    Sends an email with a retry mechanism.
    recipients: List of email addresses.
    subject: Email subject.
    html_body: HTML content of the email.
    retries: Number of retry attempts.
    delay: Delay in seconds between retries.
    Returns True on success, False on failure after all retries.
    """
    if not recipients:
        app.logger.warning("No recipients provided for email.")
        return False

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = os.getenv("SENDGRID_SENDER_EMAIL")  # Use SendGrid sender email
    msg['To'] = ", ".join(recipients)
    msg.set_content(html_body, subtype='html')

    # SendGrid SMTP configuration
    smtp_server = "smtp.sendgrid.net"
    smtp_port = 587 # or 25, 2525, 465 (for SSL/TLS)
    smtp_username = "apikey" # This is literally the username for SendGrid API Key
    smtp_password = os.getenv("SENDGRID_API_KEY") # Your SendGrid API Key

    for attempt in range(retries):
        try:
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_username, smtp_password)
                server.send_message(msg)
            app.logger.info(f"Email sent successfully to {recipients} (Attempt {attempt + 1})")
            return True
        except Exception as e:
            app.logger.error(f"Attempt {attempt + 1}: Failed to send email to {recipients}: {e}", exc_info=True)
            if attempt < retries - 1:
                time.sleep(delay)
    app.logger.error(f"Failed to send email to {recipients} after {retries} attempts.")
    return False

def force_remove_directory(path, max_retries=5, delay_seconds=0.1):
    """
    Attempts to remove a directory, retrying on PermissionError.
    This is useful on Windows where file handles may be slow to release.
    """
    for i in range(max_retries):
        try:
            if os.path.exists(path):
                shutil.rmtree(path)
            return
        except PermissionError:
            app.logger.warning(f"PermissionError removing {path}. Retrying ({i+1}/{max_retries})...")
            time.sleep(delay_seconds)
        except Exception as e:
            app.logger.error(f"Failed to remove directory {path}: {e}")
            break # Stop on other errors
    app.logger.error(f"Could not remove directory {path} after {max_retries} retries.")


def admin_required(f):
    """Decorator to protect admin routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def login_required(f):
    """Decorator to protect employee routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('employee_login'))
        return f(*args, **kwargs)
    return decorated_function

def init_db():
    """Initializes the admin user if one does not already exist."""
    admin_username = os.getenv("ADMIN_USERNAME")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_username or not admin_password:
        print(
            "WARNING: ADMIN_USERNAME and ADMIN_PASSWORD are not set in the .env file."
            " The default admin user cannot be initialized securely."
            " Please set them to enable admin login."
        )
        return
    
    # Check if any admin exists to prevent re-hashing on every run
    if admins_collection.count_documents({}) == 0:
        admins_collection.insert_one({
            "username": admin_username,
            "password": generate_password_hash(admin_password)
        })
        print("Default admin user initialized successfully.")


def allowed_file(filename):
    """Checks if a filename has an allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def save_base64_image(data, filename):
    """Saves a base64 encoded image to the specified filename."""
    try:
        if 'base64,' in data:
            data = data.split('base64,')[1]
        img_data = base64.b64decode(data)

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'faces', filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        with open(filepath, 'wb') as f:
            f.write(img_data)
        return filepath
    except Exception as e:
        app.logger.error(f"Error saving image {filename}: {e}")
        return None

def _validate_password_complexity(password):
    """Validates password against complexity rules."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character."
    return True, "Password meets complexity requirements."

def _validate_email_format(email):
    """Validates basic email format."""
    return re.match(r'^[^@]+@[^@]+\.[^@]+$', email) is not None

def _process_and_encode_face_from_path(image_path, emp_id):
    """
    Detects and encodes a face from an image file path and checks for duplicates.
    Returns face_encoding (list).
    Raises ValueError for errors.
    """
    if not os.path.exists(image_path):
        raise ValueError(f"Image file not found at path: {image_path}")

    try:
        image = face_recognition.load_image_file(image_path)
        encodings = face_recognition.face_encodings(image)

        if not encodings:
            raise ValueError("No face detected in the provided photo.")

        new_encoding = encodings[0]
        face_encoding_list = new_encoding.tolist()

        # Check for duplicate faces
        existing_users_with_faces = users_collection.find({"face_encoding": {"$ne": []}})
        for user in existing_users_with_faces:
            if user.get('emp_id') == emp_id: continue
            existing_encoding = np.array(user["face_encoding"])
            matches = face_recognition.compare_faces([existing_encoding], new_encoding, tolerance=FACE_RECOGNITION_TOLERANCE)
            if matches[0]:
                raise ValueError(f"This face is already registered with employee ID: {user['emp_id']}")

        return face_encoding_list

    except Exception as e:
        raise e


def _process_and_encode_face(photo_data, emp_id):
    """
    Handles saving a base64 image, then calls the path-based encoding function.
    Returns face_encoding (list) and saved_image_path (str).
    Raises ValueError for errors.
    """
    if not photo_data:
        raise ValueError("No photo data received.")

    filename = f"{emp_id}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
    saved_image_path = os.path.join(app.config['UPLOAD_FOLDER'], 'faces', filename)
    
    try:
        if 'base64,' in photo_data:
            photo_data = photo_data.split('base64,')[1]
        img_data = base64.b64decode(photo_data)

        os.makedirs(os.path.dirname(saved_image_path), exist_ok=True)
        with open(saved_image_path, 'wb') as f:
            f.write(img_data)
            
        face_encoding = _process_and_encode_face_from_path(saved_image_path, emp_id)
        return face_encoding, saved_image_path
    except Exception as e:
        if os.path.exists(saved_image_path):
            os.remove(saved_image_path)
        raise e


def reverse_geocode(lat, lon):
    """Performs reverse geocoding to get a human-readable address."""
    try:
        if not lat or not lon:
            return "Location not recorded"
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {'lat': lat, 'lon': lon, 'format': 'json', 'zoom': 18, 'addressdetails': 1}
        headers = {'User-Agent': 'ArgusScan/1.0', 'Accept-Language': 'en-US,en;q=0.9'}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        return data.get('display_name', f"Location at {lat:.6f}, {lon:.6f}")
    except Exception as e:
        app.logger.error(f"Geocoding failed for {lat}, {lon}: {e}")
        return f"Location at {lat:.6f}, {lon:.6f} (Error)"

def export_data(data, headers, filename, format_type='csv'):
    """Exports data to CSV or XLSX format."""
    if format_type == 'csv':
        si = io.StringIO()
        cw = csv.writer(si)
        cw.writerow(headers)
        cw.writerows(data)
        output = si.getvalue()
        mimetype = "text/csv"
        filename = f"{filename}.csv"
    elif format_type in ['xlsx', 'excel']:
        output = io.BytesIO()
        df = pd.DataFrame(data, columns=headers)
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name='Sheet1')
            worksheet = writer.sheets['Sheet1']
            for idx, col in enumerate(df.columns):
                max_len = max((df[col].astype(str).map(len).max(), len(str(col)))) + 2
                worksheet.set_column(idx, idx, max_len)
        output.seek(0)
        mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{filename}.xlsx"
    else:
        raise ValueError("Invalid export format specified.")

    return Response(
        output,
        mimetype=mimetype,
        headers={"Content-Disposition": f"attachment;filename={filename}"}
    )

def _register_employee_from_data(emp_data, image_base_path):
    """
    Core logic to register a single employee from dictionary data and an image path.
    Returns (True, "Success message") or (False, "Error message").
    """
    emp_id = str(emp_data.get('emp_id', '')).strip()
    full_name = emp_data.get('full_name', '').strip()
    email = emp_data.get('email', '').strip()
    personal_email = emp_data.get('personal_email', '').strip()
    department = emp_data.get('department', 'Not assigned').strip()
    position = emp_data.get('position', 'Not assigned').strip()
    password = str(emp_data.get('password', ''))
    image_filename = emp_data.get('image_filename', '').strip()

    if not all([emp_id, full_name, email, password, image_filename]):
        return False, f"Missing required fields for emp_id '{emp_id or 'N/A'}'."
    is_strong, pwd_msg = _validate_password_complexity(password)
    if not is_strong:
        return False, f"Password for emp_id '{emp_id}' is not strong enough: {pwd_msg}"
    if not email.endswith('@innovasolutions.com'):
        return False, f"Email for emp_id '{emp_id}' must be an @innovasolutions.com address."
    if users_collection.find_one({'$or': [{'emp_id': emp_id}, {'email': email}]}):
        return False, f"Employee ID '{emp_id}' or Email '{email}' already exists."

    image_path = os.path.join(image_base_path, image_filename)
    if not os.path.exists(image_path):
        return False, f"Image file '{image_filename}' not found for emp_id '{emp_id}'."

    try:
        face_encoding = _process_and_encode_face_from_path(image_path, emp_id)
        
        permanent_image_filename = f"{emp_id}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
        permanent_image_path = os.path.join(app.config['UPLOAD_FOLDER'], 'faces', permanent_image_filename)
        os.makedirs(os.path.dirname(permanent_image_path), exist_ok=True)
        shutil.copy(image_path, permanent_image_path)

        hashed_password = generate_password_hash(password)
        users_collection.insert_one({
            'emp_id': emp_id,
            'full_name': full_name,
            'email': email,
            'personal_email': personal_email,
            'department': department,
            'position': position,
            'password': hashed_password,
            'image_path': permanent_image_path,
            'face_encoding': face_encoding,
            "is_active": True # New field: Active by default
        })

        # Send welcome email
        recipients = [e for e in [email, personal_email] if e]
        if recipients:
            email_title = "Welcome to ArgusScan!"
            preheader = "Your new employee attendance account has been created."
            content_body = f"""
            <h2>Welcome Aboard!</h2>
            <p>Hi {full_name},</p>
            <p>Welcome to InnovaSolutions! An account has been created for you in our attendance management system, ArgusScan.</p>
            <p>Please use the following credentials for your first login:</p>
            <ul>
                <li><strong>Employee ID:</strong> {emp_id}</li>
                <li><strong>Password:</strong> The password you provided during registration. Please keep it secure.</li>
            </ul>
            <p>We strongly recommend that you change your password upon your first login for security purposes.</p>
            <a href="{url_for('employee_login', _external=True)}" class="button">Login to Your Account</a>
            <p>If you have any issues, please contact your administrator.</p>
            <p>Best regards,<br>The ArgusScan Team</p>
            """
            html_body = create_html_email(email_title, preheader, content_body)

            send_email_with_retry(recipients, email_title, html_body) # Use the new retry function

        return True, f"Successfully registered emp_id '{emp_id}'."
    except ValueError as ve:
        return False, f"Validation error for emp_id '{emp_id}': {str(ve)}"
    except Exception as e:
        app.logger.error(f"Failed to register emp_id '{emp_id}': {e}", exc_info=True)
        return False, f"An unexpected error occurred for emp_id '{emp_id}': {e}"

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/admin')
def admin_login():
    """Renders the admin login page."""
    return render_template('admin.html')

@app.route('/service-worker.js')
def service_worker():
    return send_from_directory('static/js', 'service-worker.js', mimetype='application/javascript')

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

@app.route('/offline.html')
def offline():
    return render_template('offline.html')

@app.route('/admin/auth', methods=['POST'])
def admin_authenticate():
    """Authenticates admin users."""
    username = request.form.get('adminid')
    password = request.form.get('adminpass')

    if not username or len(username) < MIN_ADMIN_ID_LENGTH:
        return render_template('admin.html', error=f'Admin ID must be at least {MIN_ADMIN_ID_LENGTH} characters.')
    if not password or len(password) < MIN_ADMIN_PASSWORD_LENGTH:
        return render_template('admin.html', error=f'Password must be at least {MIN_ADMIN_PASSWORD_LENGTH} characters.')

    try:
        admin = admins_collection.find_one({'username': username})
        if admin and check_password_hash(admin['password'], password):
            session['admin_logged_in'] = True
            session['admin_username'] = username
            return redirect(url_for('admin_dashboard'))
        return render_template('admin.html', error='Invalid credentials.')
    except Exception as e:
        app.logger.error(f"Admin authentication error: {e}")
        return render_template('admin.html', error='An internal authentication error occurred. Please try again.')

@app.route('/employee_login')
def employee_login():
    """Renders the employee login page."""
    return render_template('employee_login.html')

@app.route('/static/uploads/faces/<filename>')
def uploaded_file(filename):
    return send_from_directory(os.path.join(app.config['UPLOAD_FOLDER'], 'faces'), filename)

@app.route('/admin/logout')
def admin_logout():
    """Logs out the admin user."""
    session.pop('admin_logged_in', None)
    session.pop('admin_username', None)
    return redirect(url_for('admin_login'))

@app.route('/employee_signup', methods=['GET', 'POST'])
def employee_signup():
    """Handles employee registration, including face capture."""
    if request.method == 'POST':
        try:
            data = request.get_json()
            if not data:
                return jsonify({"success": False, "message": "Invalid request data."}), 400

            full_name = data.get('fullName')
            emp_id = data.get('empId')
            email = data.get('email')
            personal_email = data.get('personalEmail')
            password = data.get('password')
            photo_data = data.get('capturedImage')

            if not all([full_name, emp_id, email, password, photo_data]):
                return jsonify({"success": False, "message": "All required fields (Full Name, Employee ID, Company Email, Password, Photo) must be provided."}), 400

            if len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
                return jsonify({"success": False, "message": f"Employee ID must be at least {MIN_EMPLOYEE_ID_LENGTH} characters long."}), 400

            if not _validate_email_format(email):
                return jsonify({"success": False, "message": "Invalid company email format."}), 400
            if not email.endswith('@innovasolutions.com'):
                return jsonify({"success": False, "message": "Please use your @innovasolutions.com email address."}), 400

            if personal_email and not _validate_email_format(personal_email):
                return jsonify({"success": False, "message": "Invalid personal email format."}), 400

            is_strong, password_message = _validate_password_complexity(password)
            if not is_strong:
                return jsonify({"success": False, "message": password_message}), 400

            if users_collection.find_one({'emp_id': emp_id}):
                return jsonify({"success": False, "message": "Employee ID already exists. Please choose a different one."}), 400
            if users_collection.find_one({'email': email}):
                return jsonify({"success": False, "message": "Company email already exists. Please use a different one."}), 400

            try:
                face_encoding, image_path = _process_and_encode_face(photo_data, emp_id)
            except ValueError as ve:
                return jsonify({"success": False, "message": str(ve)}), 400
            except Exception as e:
                app.logger.error(f"Face processing error during signup: {e}")
                return jsonify({"success": False, "message": "Failed to process face photo."}), 500

            hashed_password = generate_password_hash(password)
            users_collection.insert_one({
                "emp_id": emp_id,
                "full_name": full_name,
                "email": email,
                "personal_email": personal_email or "",
                "image_path": image_path,
                "face_encoding": face_encoding,
                "password": hashed_password,
                "department": "Not assigned",
                "position": "Not assigned",
                "is_active": True # New field: Active by default
            })
            
            # Send welcome email on individual signup
            recipients = [e for e in [email, personal_email] if e]
            if recipients:
                email_title = "Welcome to ArgusScan!"
                preheader = "Your new employee attendance account has been created."
                content_body = f"""
                <h2>Welcome Aboard!</h2>
                <p>Hi {full_name},</p>
                <p>You have successfully registered for the ArgusScan attendance system.</p>
                <p>Your login details are:</p>
                <ul>
                    <li><strong>Employee ID:</strong> {emp_id}</li>
                    <li><strong>Password:</strong> The password you just created. Please keep it secure.</li>
                </ul>
                <a href="{url_for('employee_login', _external=True)}" class="button">Login Now</a>
                <p>Best regards,<br>The ArgusScan Team</p>
                """
                html_body = create_html_email(email_title, preheader, content_body)

                send_email_with_retry(recipients, email_title, html_body) # Use the new retry function


            return jsonify({"success": True, "message": "Registration successful. You can now log in."}), 200

        except Exception as e:
            app.logger.error(f"Error in employee_signup route: {e}", exc_info=True)
            return jsonify({"success": False, "message": f"An unexpected error occurred during registration. Please try again later."}), 500

    return render_template('employee_signup.html')


@app.route('/employee')
@login_required # Apply login_required decorator
def employee():
    """Renders the employee dashboard with today's attendance activity, including regularized records."""
    emp_id = session['user']['emp_id']
    username = session['user']['username']

    try:
        today_iso = datetime.date.today().isoformat()

        # Fetch ALL attendance records for today, including 'Historical' and 'Regularized' ones.
        # This allows displaying original records and their regularized counterparts.
        raw_records = list(attendance_collection.find({
            "emp_id": emp_id,
            "date": today_iso,
        }).sort([("punch_in", 1), ("regularized_at", 1)])) # Sort by punch_in then regularization timestamp for order

        user_data = users_collection.find_one({"emp_id": emp_id})

        attendance_records_today = []
        current_status = "Punched Out" # Default status for the banner

        for record in raw_records:
            punch_in = record.get('punch_in')
            punch_out = record.get('punch_out')
            # Status can now also be 'On Leave'
            status = record.get('status')
            
            # If a record is 'On Leave', we want to show that as the status for the day,
            # and it should override any partial punches.
            if status == 'On Leave':
                current_status = "On Leave"
                attendance_records_today = [{ # Clear existing and add this as the primary record
                    'punch_in': '-',
                    'punch_out': '-',
                    'status': 'On Leave'
                }]
                break # If on leave, no need to process other punches for the day.

            display_punch_in = datetime.datetime.fromisoformat(punch_in).strftime('%H:%M:%S') if punch_in else '-'
            display_punch_out = datetime.datetime.fromisoformat(punch_out).strftime('%H:%M:%S') if punch_out else '-'

            # Use the status directly from the record. The template will handle the badge colors.
            display_status = status 
            
            # Determine the employee's current punch status for the banner (Active means punched in)
            if status == 'Active':
                current_status = "Punched In"

            attendance_records_today.append({
                'punch_in': display_punch_in,
                'punch_out': display_punch_out,
                'status': display_status
            })

        image_path = None
        if user_data and user_data.get('image_path'):
            if user_data['image_path'].startswith(app.config['UPLOAD_FOLDER']):
                image_path = url_for('uploaded_file', filename=os.path.basename(user_data['image_path']))
            else:
                image_path = user_data['image_path']

        return render_template('employee.html',
                               username=username,
                               status=current_status,
                               attendance_records=attendance_records_today,
                               emp_id=emp_id,
                               user={
                                   'emp_id': user_data['emp_id'],
                                   'image_path': image_path,
                                   'email': user_data.get('email', ''),
                                   'personal_email': user_data.get('personal_email', ''),
                                   'department': user_data.get('department', 'Not assigned'),
                                   'position': user_data.get('position', 'Not assigned')
                               })
    except Exception as e:
        app.logger.error(f"Error loading employee dashboard for {emp_id}: {str(e)}", exc_info=True)
        return render_template('employee.html',
                               error=f'Failed to load dashboard data: {str(e)}',
                               username=session.get('user', {}).get('username', 'Employee'),
                               status='Error',
                               attendance_records=[],
                               emp_id=session.get('user', {}).get('emp_id', 'N/A'),
                               user={'emp_id': 'N/A', 'image_path': None, 'personal_email': '', 'department': 'N/A', 'position': 'N/A'}
                               )

@app.route('/auto_signin', methods=['POST'])
def auto_signin():
    """Handles automatic punch-in/punch-out via face recognition."""
    temp_path = None
    try:
        photo_data = request.json.get('capturedPhoto')
        action = request.json.get('action', 'punchin')
        latitude = request.json.get('latitude')
        longitude = request.json.get('longitude')

        if not photo_data:
            return jsonify({'success': False, 'message': 'No image received for recognition.'}), 400

        temp_filename = f"temp_recognition_{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')}.jpg"
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], 'faces', temp_filename)
        
        try:
            # Save the image data
            if 'base64,' in photo_data:
                photo_data = photo_data.split('base64,')[1]
            img_data = base64.b64decode(photo_data)
            os.makedirs(os.path.dirname(temp_path), exist_ok=True)
            with open(temp_path, 'wb') as f:
                f.write(img_data)
        except Exception as e:
            app.logger.error(f"Failed to save temp image {temp_filename}: {e}")
            return jsonify({'success': False, 'message': 'Failed to save temporary image.'}), 500


        temp_image = face_recognition.load_image_file(temp_path)
        temp_encodings = face_recognition.face_encodings(temp_image)

        if not temp_encodings:
            os.remove(temp_path)
            return jsonify({'success': False, 'message': 'No face detected in the captured photo.'}), 400

        temp_encoding = temp_encodings[0]
        matched_user = None
        best_match_score = 0.0

        users = list(users_collection.find({"face_encoding": {"$ne": []}}))

        for user in users:
            try:
                stored_encoding = np.array(user["face_encoding"])
                face_distance = face_recognition.face_distance([stored_encoding], temp_encoding)[0]
                match_score = 1 - face_distance

                if match_score > best_match_score and match_score >= BEST_MATCH_SCORE_THRESHOLD:
                    best_match_score = match_score
                    matched_user = {
                        'emp_id': user['emp_id'],
                        'full_name': user['full_name'],
                        'image_path': user['image_path'],
                        'match_score': match_score,
                        'is_active': user.get('is_active', True) # Get active status
                    }
            except Exception as e:
                app.logger.error(f"Error processing face encoding for user {user.get('emp_id', 'N/A')}: {e}")
                continue

        if os.path.exists(temp_path):
            os.remove(temp_path)

        if not matched_user:
            return jsonify({'success': False, 'message': 'User not recognized. Please try again.', 'confidence': round(best_match_score, 2)}), 404

        # Check if the matched user account is active
        if not matched_user.get('is_active', True):
            return jsonify({'success': False, 'message': 'Account is deactivated. Please contact your administrator.', 'confidence': round(best_match_score, 2)}), 403 # Forbidden

        emp_id = matched_user['emp_id']
        today_iso = datetime.date.today().isoformat()
        now_iso = datetime.datetime.now().isoformat()

        address = reverse_geocode(latitude, longitude) if latitude and longitude else 'Location not recorded'

        # Check if the employee is marked as "On Leave" for today
        on_leave_today = attendance_collection.find_one(
            {"emp_id": emp_id, "date": today_iso, "status": "On Leave"}
        )
        if on_leave_today:
            return jsonify({'success': False, 'message': 'You are currently on leave today. Cannot punch in/out.', 'confidence': round(best_match_score, 2)}), 400


        active_record = attendance_collection.find_one(
            {"emp_id": emp_id, "date": today_iso, "punch_out": None, "status": {"$nin": ["Historical", "On Leave"]}},
            sort=[("punch_in", -1)]
        )

        status_message = ""
        if action == 'punchin':
            if active_record:
                return jsonify({'success': False, 'message': 'You are already punched in. Please punch out first.', 'confidence': round(best_match_score, 2)}), 400

            attendance_collection.insert_one({
                "emp_id": emp_id,
                "date": today_iso,
                "punch_in": now_iso,
                "punch_out": None,
                "latitude": latitude,
                "longitude": longitude,
                "address": address,
                "punch_out_latitude": None,
                "punch_out_longitude": None,
                "punch_out_address": None,
                "status": "Active"
            })
            status_message = "Punched In Successfully"
        elif action == 'punchout':
            if not active_record:
                return jsonify({'success': False, 'message': 'No active punch in found for today. Please punch in first.', 'confidence': round(best_match_score, 2)}), 400

            attendance_collection.update_one(
                {"_id": active_record["_id"]},
                {"$set": {
                    "punch_out": now_iso,
                    "punch_out_latitude": latitude,
                    "punch_out_longitude": longitude,
                    "punch_out_address": address,
                    "status": "Completed"
                }}
            )
            status_message = "Punched Out Successfully"
        else:
            return jsonify({'success': False, 'message': 'Invalid action specified.', 'confidence': round(best_match_score, 2)}), 400

        user_image_url = url_for('uploaded_file', filename=os.path.basename(matched_user['image_path']))

        return jsonify({
            'success': True,
            'full_name': matched_user['full_name'],
            'emp_id': emp_id,
            'status': status_message,
            'image_path': user_image_url,
            'confidence': round(best_match_score, 2),
            'action': action,
            'location': address,
            'timestamp': now_iso
        }), 200

    except Exception as e:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        app.logger.error(f"Auto sign-in error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f"An internal server error occurred during recognition: {str(e)}", 'confidence': 0.0}), 500


@app.route('/employee_login_auth', methods=['POST'])
def employee_login_auth():
    """Authenticates employee users via ID and password."""
    try:
        data = request.get_json()
        emp_id = data.get('empId')
        password = data.get('password')

        if not emp_id or not password:
            return jsonify({'success': False, 'message': 'Employee ID and password are required.'}), 400

        if len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
            return jsonify({'success': False, 'message': f'Employee ID must be at least {MIN_EMPLOYEE_ID_LENGTH} characters long.'}), 400

        user = users_collection.find_one({"emp_id": emp_id})

        if not user:
            return jsonify({'success': False, 'message': 'Invalid Employee ID or password.'}), 401

        # Check if the account is active
        if not user.get('is_active', True): # Treat 'None' as active for existing accounts
            return jsonify({'success': False, 'message': 'Your account is deactivated. Please contact your administrator.'}), 403

        stored_password_hash = user.get('password')
        if not stored_password_hash or not check_password_hash(stored_password_hash, password):
            return jsonify({'success': False, 'message': 'Invalid Employee ID or password.'}), 401

        session['user'] = {
            'username': user.get('full_name', 'Employee'),
            'emp_id': user.get('emp_id'),
            'status': 'Logged In',
            'image_path': user.get('image_path'),
            'email': user.get('email', ''),
            'personal_email': user.get('personal_email', ''),
            'department': user.get('department', 'Not assigned'),
            'position': user.get('position', 'Not assigned')
        }
        return jsonify({'success': True, 'message': 'Login successful. Redirecting...'}), 200

    except Exception as e:
        app.logger.error(f"Employee login error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred during login. Please try again.'}), 500

@app.route('/attendance')
@login_required # Apply login_required decorator
def attendance():
    """Renders the employee attendance history page."""
    emp_id = session['user']['emp_id']

    try:
        # Fetch all attendance records AND leave records for the employee
        raw_attendance_records = list(attendance_collection.find({"emp_id": emp_id}).sort([("date", -1), ("punch_in", 1)]))
        
        # New: Fetch approved leave requests for this employee
        approved_leave_requests = list(leave_requests_collection.find({
            "emp_id": emp_id,
            "status": "Approved"
        }))

        attendance_data_map = {}

        # Process approved leave requests first to mark full days
        for leave_req in approved_leave_requests:
            start_date = datetime.datetime.fromisoformat(leave_req['start_date']).date()
            end_date = datetime.datetime.fromisoformat(leave_req['end_date']).date()
            current_date = start_date
            while current_date <= end_date:
                iso_date = current_date.isoformat()
                # Overwrite or create attendance record for leave days
                attendance_data_map[iso_date] = {
                    'date': current_date.strftime('%d %b %Y'),
                    'shift_in': '09:00', # Default shift times
                    'shift_out': '17:00',
                    'actual_in': '-',
                    'actual_out': '-',
                    'work_hours': '00:00', # 0 hours worked on leave
                    'status': 'On Leave',
                    'address': 'On Leave',
                    'punch_records_today': [],
                    'is_regularized': False,
                    'regularized_data': {},
                    'leave_details': {
                        'type': leave_req.get('leave_type', 'N/A'),
                        'reason': leave_req.get('reason', 'N/A')
                    }
                }
                current_date += datetime.timedelta(days=1)


        for record in raw_attendance_records:
            date_key = record['date']

            # If this date is already marked as 'On Leave', skip processing further attendance for it
            if date_key in attendance_data_map and attendance_data_map[date_key]['status'] == 'On Leave':
                continue
            
            if date_key not in attendance_data_map:
                attendance_data_map[date_key] = {
                    'date': datetime.datetime.fromisoformat(date_key).strftime('%d %b %Y'),
                    'shift_in': '09:00', # Default shift times
                    'shift_out': '17:00',
                    'actual_in': '-',
                    'actual_out': '-',
                    'work_hours': '-',
                    'status': 'Absent', # Default for days not yet processed or with no punches
                    'address': 'Location not recorded',
                    'punch_records_today': [], # Store all punch records for the day to calculate work hours
                    'is_regularized': False,
                    'regularized_data': {} # Store regularized details if applicable
                }

            current_day_data = attendance_data_map[date_key]

            if record.get('status') == 'Regularized':
                current_day_data['is_regularized'] = True
                # Use regularized times as definitive actual_in/out for display
                current_day_data['actual_in'] = datetime.datetime.fromisoformat(record['punch_in']).strftime('%H:%M') if record.get('punch_in') else '-'
                current_day_data['actual_out'] = datetime.datetime.fromisoformat(record['punch_out']).strftime('%H:%M') if record.get('punch_out') else '-'
                current_day_data['status'] = 'Regularized' # Set status to Regularized
                # Store enough info to calculate total hours from regularized record
                current_day_data['regularized_data'] = {
                    'punch_in': record.get('punch_in'),
                    'punch_out': record.get('punch_out')
                }
                # Clear other punch records for this day as regularization overrides them for work hours calculation
                current_day_data['punch_records_today'] = []

            elif not current_day_data['is_regularized'] and record.get('status') != 'Historical':
                # Add all valid punch records for calculation later if not regularized
                current_day_data['punch_records_today'].append(record)

                # Update actual_in/out for display (first punch in, last punch out of non-regularized records)
                if record.get('punch_in'):
                    if current_day_data['actual_in'] == '-' or datetime.datetime.fromisoformat(record['punch_in']).time() < datetime.datetime.strptime(current_day_data['actual_in'], '%H:%M').time():
                        current_day_data['actual_in'] = datetime.datetime.fromisoformat(record['punch_in']).strftime('%H:%M')

                if record.get('punch_out'):
                    if current_day_data['actual_out'] == '-' or datetime.datetime.fromisoformat(record['punch_out']).time() > datetime.datetime.strptime(current_day_data['actual_out'], '%H:%M').time():
                        current_day_data['actual_out'] = datetime.datetime.fromisoformat(record['punch_out']).strftime('%H:%M')

                # Update status for display (Active > Present > Absent)
                if record.get('status') == 'Active':
                    current_day_data['status'] = 'Active'
                elif record.get('status') == 'Completed':
                    if current_day_data['status'] not in ['Active', 'Present']: # Only if not already Active
                        current_day_data['status'] = 'Present'


            # Determine primary address for display from any record that has location info
            if record.get('address') and record['address'] != 'Location not recorded':
                current_day_data['address'] = record['address']
            elif record.get('latitude') and record.get('longitude') and (record['latitude'] is not None and record['longitude'] is not None):
                try:
                    geo_address = reverse_geocode(record['latitude'], record['longitude'])
                    if geo_address and geo_address != 'Location not recorded':
                        current_day_data['address'] = geo_address
                except Exception:
                    pass

        final_attendance_records = []
        for date_key in sorted(attendance_data_map.keys(), reverse=True):
            data = attendance_data_map[date_key]
            total_work_seconds = 0

            # If already marked as 'On Leave', directly add it and continue
            if data['status'] == 'On Leave':
                # Ensure work_hours is '00:00' for leave days
                data['work_hours'] = '00:00'
                # Clean up temporary keys
                del data['punch_records_today']
                del data['is_regularized']
                del data['regularized_data']
                if 'leave_details' in data: # Keep leave_details if present
                    final_attendance_records.append(data)
                continue # Skip further processing for this day

            if data['is_regularized']:
                # Calculate work hours from regularized data
                if data['regularized_data'].get('punch_in') and data['regularized_data'].get('punch_out'):
                    try:
                        start_time = datetime.datetime.fromisoformat(data['regularized_data']['punch_in'])
                        end_time = datetime.datetime.fromisoformat(data['regularized_data']['punch_out'])
                        if end_time > start_time:
                            total_work_seconds += (end_time - start_time).total_seconds()
                    except ValueError as e:
                        app.logger.warning(f"Error parsing regularized times for {date_key}: {e}")
            else:
                # Sort records by punch_in time to ensure correct pairing
                sorted_punch_records = sorted(data['punch_records_today'], key=lambda x: x.get('punch_in') or '', reverse=False)

                for record in sorted_punch_records:
                    punch_in_dt = None
                    punch_out_dt = None

                    if record.get('punch_in'):
                        try:
                            punch_in_dt = datetime.datetime.fromisoformat(record['punch_in'])
                        except ValueError as e:
                            app.logger.warning(f"Invalid punch_in format for {record.get('emp_id')} on {record.get('date')}: {e}")

                    if record.get('punch_out'):
                        try:
                            punch_out_dt = datetime.datetime.fromisoformat(record['punch_out'])
                        except ValueError as e:
                            app.logger.warning(f"Invalid punch_out format for {record.get('emp_id')} on {record.get('date')}: {e}")

                    if punch_in_dt and punch_out_dt and punch_out_dt > punch_in_dt:
                        total_work_seconds += (punch_out_dt - punch_in_dt).total_seconds()
                    # If punched in but not out yet, count duration until now (only if it's today)
                    elif punch_in_dt and not punch_out_dt and data['status'] == 'Active' and datetime.datetime.fromisoformat(record['date']).date() == datetime.date.today():
                         total_work_seconds += (datetime.datetime.now() - punch_in_dt).total_seconds()


            # Format total work hours
            if total_work_seconds > 0:
                hours, remainder = divmod(int(total_work_seconds), 3600)
                minutes = (remainder // 60)
                data['work_hours'] = f"{hours:02d}:{minutes:02d}"
            else:
                data['work_hours'] = '-'

            # Determine final status for display
            if data['is_regularized']:
                data['status'] = 'Regularized'
            elif total_work_seconds > 0 and data['status'] != 'Active': # If some work done, and not currently active
                data['status'] = 'Present'
            elif data['status'] == 'Active': # If still active, show as Active
                data['status'] = 'Active'
            else: # No punches, not regularized, and not on leave
                data['status'] = 'Absent'

            if data['status'] == 'Present' and data['actual_in'] != '-' and not data['is_regularized']:
                try:
                    actual_in_time = datetime.datetime.strptime(data['actual_in'], '%H:%M').time()
                    shift_in_time = datetime.datetime.strptime(data['shift_in'], '%H:%M').time()
                    if actual_in_time > shift_in_time:
                        data['status'] = 'Late'
                except ValueError:
                    pass

            # Clean up temporary keys
            del data['punch_records_today']
            del data['is_regularized']
            del data['regularized_data'] # Remove if not needed for final rendering
            if 'leave_details' in data: # Remove leave_details if it was processed and not the primary status
                del data['leave_details']

            final_attendance_records.append(data)

        return render_template('attendance.html',
                               attendance_records=final_attendance_records,
                               user=session['user'])
    except Exception as e:
        app.logger.error(f"Error loading attendance records for {emp_id}: {str(e)}", exc_info=True)
        return render_template('attendance.html',
                               error=f'Failed to load attendance history: {str(e)}',
                               user=session['user'],
                               attendance_records=[])

@app.route('/regularize_attendance', methods=['POST'])
@login_required # Apply login_required decorator
def regularize_attendance():
    try:
        data = request.get_json()
        if not data or 'records' not in data:
            return jsonify({'success': False, 'message': 'Invalid data format'}), 400
        
        emp_id = session['user']['emp_id']
        updated_records = []

        for record in data['records']:
            date_str = record['date']
            try:
                date_obj = datetime.datetime.strptime(date_str, '%d %b %Y')
                iso_date = date_obj.date().isoformat()
            except ValueError:
                return jsonify({'success': False, 'message': f'Invalid date format: {date_str}. Expected format: "DD Mon YYYY"'}), 400
            
            modified_in = f"{iso_date}T{record['modified_in']}:00" if record['modified_in'] else None
            modified_out = f"{iso_date}T{record['modified_out']}:00" if record['modified_out'] else None
            reason = record.get('reason', '')
            comments = record.get('comments', '')

            # --- CRITICAL FIX START ---
            # 1. Find ALL existing non-historical, non-regularized, and non-on-leave records
            #    for the given employee and date. These are the original punch segments
            #    that need to be converted to 'Historical'.
            original_attendance_segments = list(attendance_collection.find(
                {"emp_id": emp_id, "date": iso_date, "status": {"$nin": ["Historical", "Regularized", "On Leave"]}}
            ))

            # Variables to hold the earliest punch-in and associated location from original segments
            # for the new 'Regularized' record itself.
            earliest_original_punch_in_time = None
            original_latitude = None
            original_longitude = None
            original_address = None

            # 2. Iterate through all found original segments and update their status to 'Historical'.
            #    Also capture the earliest punch-in time and its location.
            for segment in original_attendance_segments:
                attendance_collection.update_one(
                    {"_id": segment["_id"]},
                    {"$set": {"status": "Historical"}}
                )
                
                # Keep track of the very first punch-in time for the day to potentially link its location
                if segment.get("punch_in"):
                    # Compare time part only for earliest punch-in for that specific date
                    segment_punch_in_dt = datetime.datetime.fromisoformat(segment["punch_in"])
                    if earliest_original_punch_in_time is None or segment_punch_in_dt < datetime.datetime.fromisoformat(earliest_original_punch_in_time):
                        earliest_original_punch_in_time = segment["punch_in"]
                        original_latitude = segment.get("latitude")
                        original_longitude = segment.get("longitude")
                        original_address = segment.get("address")
            # --- CRITICAL FIX END ---

            # 3. Insert the new 'Regularized' record with the modified times.
            #    It uses the location from the *earliest original punch* if available.
            inserted_id = attendance_collection.insert_one({
                "emp_id": emp_id,
                "date": iso_date,
                "punch_in": modified_in,  # These are the NEW, MODIFIED times
                "punch_out": modified_out, # These are the NEW, MODIFIED times
                "latitude": original_latitude,    # Retain original latitude from the earliest punch
                "longitude": original_longitude,  # Retain original longitude from the earliest punch
                "address": original_address,      # Retain original address from the earliest punch
                "status": "Regularized",
                "regularized_reason": reason,
                "regularized_comments": comments,
                "regularized_at": datetime.datetime.now().isoformat() # Timestamp for regularization
            }).inserted_id

            # Fetch the newly inserted regularized record to return accurate `updated_records` to the frontend.
            inserted_record = attendance_collection.find_one({"_id": inserted_id})

            if inserted_record:
                updated_records.append({
                    'date': datetime.datetime.fromisoformat(inserted_record['date']).strftime('%d %b %Y'),
                    'actual_in': datetime.datetime.fromisoformat(inserted_record['punch_in']).strftime('%H:%M') if inserted_record.get('punch_in') else '-',
                    'actual_out': datetime.datetime.fromisoformat(inserted_record['punch_out']).strftime('%H:%M') if inserted_record.get('punch_out') else '-',
                    'status': inserted_record.get('status', 'Regularized'),
                    'modified_in': datetime.datetime.fromisoformat(inserted_record['punch_in']).strftime('%H:%M') if inserted_record.get('punch_in') else '-',
                    'modified_out': datetime.datetime.fromisoformat(inserted_record['punch_out']).strftime('%H:%M') if inserted_record.get('punch_out') else '-'
                })

        return jsonify({
            'success': True,
            'message': 'Attendance regularized successfully',
            'updated_records': updated_records
        })
    except Exception as e:
        app.logger.error(f"Error regularizing attendance: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/admin/dashboard')
@admin_required
def admin_dashboard():
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        emp_id_filter = request.args.get('emp_id')
        status_filter = request.args.get('status')
        sort = request.args.get('sort', 'date_desc')
        page = int(request.args.get('page', 1))
        per_page = 10
        
        # Only count active employees for total employees stat
        total_employees = users_collection.count_documents({"is_active": True}) 
        today = datetime.date.today().isoformat()

        # New logic for Present Today: Count unique employees with any punch_in today
        present_count_pipeline = [
            {"$match": {"date": today, "punch_in": {"$ne": None}, "status": {"$nin": ["On Leave", "Regularized"]}}}, # Exclude On Leave, Regularized for this stat
            {"$group": {"_id": "$emp_id"}}
        ]
        present_count = len(list(attendance_collection.aggregate(present_count_pipeline)))

        # New logic for Late Today: Count unique employees whose first punch_in is after 12:00 PM
        late_count = 0
        today_punch_ins_for_late = attendance_collection.aggregate([
            {"$match": {"date": today, "punch_in": {"$ne": None}, "status": {"$nin": ["On Leave", "Regularized"]}}}, # Exclude On Leave, Regularized for this stat
            {"$group": {
                "_id": "$emp_id",
                "first_punch_in": {"$min": "$punch_in"}
            }}
        ])

        for entry in today_punch_ins_for_late:
            try:
                first_punch_time = datetime.datetime.fromisoformat(entry['first_punch_in']).time()
                # Check if punch-in is after 12:00 PM
                if first_punch_time > datetime.time(12, 0, 0):
                    late_count += 1
            except Exception as e:
                app.logger.warning(f"Error parsing punch_in time for late count: {e}")
                continue

        # Combined count for Regularized and On Leave records for stat card
        regularized_and_leave_records_count = attendance_collection.count_documents({"status": {"$in": ["Regularized", "On Leave"]}})
        # Count only pending leave requests for the "Pending Requests" stat
        pending_leave_requests_count = leave_requests_collection.count_documents({"status": "Pending"})


        # Modify query to include 'Historical' records and only exclude 'Regularized'
        query = {"status": {"$ne": "Regularized"}} # Exclude only 'Regularized'
        
        if start_date:
            query["date"] = {"$gte": start_date}
        if end_date:
            query.setdefault("date", {}).update({"$lte": end_date})
        if emp_id_filter:
            # First, check if emp_id_filter is an actual emp_id
            if users_collection.find_one({"emp_id": emp_id_filter, "is_active": True}):
                query["emp_id"] = emp_id_filter
            else:
                # If not an exact emp_id, try to search by full_name for active users
                user_ids_from_name_search = [
                    u['emp_id'] for u in users_collection.find(
                        {"full_name": {'$regex': emp_id_filter, '$options': 'i'}, "is_active": True}, {"emp_id": 1}
                    )
                ]
                if user_ids_from_name_search:
                    query["emp_id"] = {"$in": user_ids_from_name_search}
                else:
                    # If no match by ID or name, return empty results
                    query["emp_id"] = "NO_MATCH_FOUND" # Guarantee no results
        
        # Apply status filter only if provided, allowing all non-Regularized statuses if not provided
        if status_filter:
            # If status filter is provided, use it, overriding the default $ne.
            # This allows filtering for "On Leave", "Active", "Completed", "Absent", or "Historical".
            query["status"] = status_filter
        
        total_records = attendance_collection.count_documents(query)
        total_pages = (total_records + per_page - 1) // per_page
        skip = (page - 1) * per_page

        # Determine sort field and order based on the 'sort' parameter
        if sort == 'date_asc':
            sort_field, sort_order = 'date', 1
        elif sort == 'date_desc':
            sort_field, sort_order = 'date', -1
        elif sort == 'punch_in_asc':
            sort_field, sort_order = 'punch_in', 1
        elif sort == 'punch_in_desc':
            sort_field, sort_order = 'punch_in', -1
        else:
            sort_field, sort_order = 'date', -1  # Default

        records = attendance_collection.find(query).sort(sort_field, sort_order).skip(skip).limit(per_page)
        
        attendance_records = []
        for record in records:
            user = users_collection.find_one({"emp_id": record['emp_id']}) or {}
            punch_in = record.get('punch_in')
            punch_out = record.get('punch_out')
            date_str = record.get('date')
            
            # Use stored address if available, otherwise reverse geocode if lat/lng are present
            punch_in_address = record.get('address')
            if not punch_in_address or punch_in_address == 'Location not recorded':
                punch_in_lat = record.get('latitude')
                punch_in_lng = record.get('longitude')
                if punch_in_lat and punch_in_lng:
                    punch_in_address = reverse_geocode(punch_in_lat, punch_in_lng)
                else:
                    punch_in_address = "Location not recorded"

            punch_out_address = record.get('punch_out_address')
            if not punch_out_address or punch_out_address == 'Location not recorded':
                punch_out_lat = record.get('punch_out_latitude')
                punch_out_lng = record.get('punch_out_longitude')
                if punch_out_lat and punch_out_lng:
                    punch_out_address = reverse_geocode(punch_out_lat, punch_out_lng)
                else:
                    punch_out_address = "Location not recorded"

            attendance_records.append({
                'full_name': user.get('full_name', 'Unknown'),
                'emp_id': record.get('emp_id'),
                'date': datetime.datetime.fromisoformat(date_str).strftime('%Y-%m-%d') if date_str else '-',
                'punch_in': datetime.datetime.fromisoformat(punch_in).strftime('%H:%M:%S') if punch_in else '-',
                'punch_out': datetime.datetime.fromisoformat(punch_out).strftime('%H:%M:%S') if punch_out else '-',
                'punch_in_address': punch_in_address,
                'punch_out_address': punch_out_address,
                'status': record.get('status', 'Present')
            })
        
        status_options = sorted(list(attendance_collection.distinct("status", {"status": {"$ne": "Regularized"}}))) # Options for filter dropdown
        
        return render_template('admin_dashboard.html',
                               attendance_records=attendance_records,
                               start_date=start_date or '',
                               end_date=end_date or '',
                               emp_id=emp_id_filter or '',
                               status_filter=status_filter or '',
                               status_options=status_options,
                               sort=sort,
                               total_employees=total_employees,
                               present_count=present_count,
                               late_count=late_count,
                               # New stat variable names
                               regularized_and_leave_records_count=regularized_and_leave_records_count,
                               pending_leave_requests_count=pending_leave_requests_count,
                               total_records=total_records,
                               total_pages=total_pages,
                               page=page)
    except Exception as e:
        app.logger.error(f"Error in admin_dashboard: {str(e)}")
        return render_template('admin_dashboard.html',
                               error=f'An error occurred: {str(e)}',
                               attendance_records=[],
                               status_options=[],
                               total_employees=0,
                               present_count=0,
                               late_count=0,
                               regularized_and_leave_records_count=0,
                               pending_leave_requests_count=0,
                               total_records=0,
                               total_pages=0,
                               page=1)
    
@app.route('/admin/regularization')
@admin_required
def admin_regularization():
    """Renders the admin regularization requests history page, now showing all regularized records."""
    try:
        employee_filter = request.args.get('employee', '').strip()
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        page = int(request.args.get('page', 1))
        per_page = 10
        skip = (page - 1) * per_page

        # The query specifically targets records with the "Regularized" status.
        query = {"status": "Regularized"}

        if start_date:
            query["date"] = {"$gte": start_date}
        if end_date:
            query.setdefault("date", {}).update({"$lte": end_date})

        if employee_filter:
            user_ids_from_name_search = [
                u['emp_id'] for u in users_collection.find(
                    {"full_name": {'$regex': employee_filter, '$options': 'i'}}, {"emp_id": 1}
                )
            ]
            emp_ids_to_filter = user_ids_from_name_search + ([employee_filter] if employee_filter not in user_ids_from_name_search else [])
            query["emp_id"] = {"$in": emp_ids_to_filter}

        total_records = attendance_collection.count_documents(query)
        total_pages = (total_records + per_page - 1) // per_page

        pipeline = [
            {"$match": query},
            {"$sort": {"date": -1, "regularized_at": -1}},
            {"$skip": skip},
            {"$limit": per_page},
            {
                "$lookup": {
                    "from": "users",
                    "localField": "emp_id",
                    "foreignField": "emp_id",
                    "as": "user_info"
                }
            },
            {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
            # MODIFICATION START: Updated lookup to get true original times from all relevant records
            {
                "$lookup": {
                    "from": "attendance",
                    "let": {"emp_id_val": "$emp_id", "date_val": "$date", "current_record_id": "$_id"},
                    "pipeline": [
                        {"$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$emp_id", "$$emp_id_val"]},
                                    {"$eq": ["$date", "$$date_val"]},
                                    {"$ne": ["$_id", "$$current_record_id"]}, # Exclude the current regularized record
                                    {"$ne": ["$status", "On Leave"]} # Exclude On Leave records
                                ]
                            }
                        }},
                        {"$group": {
                            "_id": None,
                            "min_punch_in": {"$min": "$punch_in"},
                            "max_punch_out": {"$max": "$punch_out"}
                        }}
                    ],
                    "as": "historical_summary"
                }
            },
            # MODIFICATION END
            {
                "$addFields": {
                    # Extract the first (and only) summary document from the array
                    "historical_data": {"$arrayElemAt": ["$historical_summary", 0]},
                    "full_name": {"$ifNull": ["$user_info.full_name", "Unknown"]}
                }
            },
            {
                "$project": {
                    "id": {"$toString": "$_id"},
                    "full_name": 1,
                    "emp_id": 1,
                    "date": 1,
                    # Use the aggregated min_punch_in and max_punch_out for original times
                    "original_punch_in": {"$ifNull": ["$historical_data.min_punch_in", "-"]},
                    "original_punch_out": {"$ifNull": ["$historical_data.max_punch_out", "-"]},
                    "modified_punch_in": "$punch_in",
                    "modified_punch_out": "$punch_out",
                    "regularized_reason": 1,
                    "status": 1,
                    "regularized_comments": 1
                }
            }
        ]

        regularization_records_display = list(attendance_collection.aggregate(pipeline))

        def format_time_for_display(val):
            try:
                if val and val != '-':
                    return datetime.datetime.fromisoformat(val).strftime('%H:%M')
            except ValueError:
                pass
            return val or '-'

        for rec in regularization_records_display:
            rec['date'] = datetime.datetime.fromisoformat(rec['date']).strftime('%Y-%m-%d') if rec.get('date') else '-'
            rec['original_punch_in'] = format_time_for_display(rec['original_punch_in'])
            rec['original_punch_out'] = format_time_for_display(rec['original_punch_out'])
            rec['modified_punch_in'] = format_time_for_display(rec['modified_punch_in'])
            rec['modified_punch_out'] = format_time_for_display(rec['modified_punch_out'])
            rec['reason'] = rec.get('regularized_reason', '-') or '-'
            rec['comments'] = rec.get('regularized_comments', '-') or '-'

        return render_template('admin_regularization.html',
                               regularization_records=regularization_records_display,
                               employee_filter=employee_filter,
                               start_date=start_date,
                               end_date=end_date,
                               total_records=total_records,
                               total_pages=total_pages,
                               page=page,
                               per_page=per_page)

    except Exception as e:
        app.logger.error(f"Error in admin_regularization: {str(e)}", exc_info=True)
        return render_template('admin_regularization.html',
                               error=f'Failed to load regularization records: {str(e)}',
                               regularization_records=[],
                               total_records=0,
                               total_pages=0,
                               page=1)

@app.route('/admin/export_employees', methods=['GET']) # Export for employees (file download)
@admin_required
def export_employees():
    """Exports employee data to CSV or XLSX format based on filters."""
    try:
        search = request.args.get('search', '').strip()
        department = request.args.get('department', '').strip()
        format_type = request.args.get('format', 'xlsx').lower() # Default to xlsx

        query = {}
        if search:
            regex = {'$regex': search, '$options': 'i'}
            query['$or'] = [
                {'full_name': regex},
                {'emp_id': regex},
                {'email': regex},
                {'personal_email': regex}
            ]
        if department:
            query['department'] = department

        employees = list(users_collection.find(query, {
            'emp_id': 1, 'full_name': 1, 'email': 1,
            'personal_email': 1, 'image_path': 1,
            'department': 1, 'position': 1, 'is_active': 1 # Include is_active
        }))

        headers = ["Employee ID", "Full Name", "Company Email", "Personal Email", "Department", "Position", "Status"]
        data = []

        for emp in employees:
            data.append([
                emp.get('emp_id', '-'),
                emp.get('full_name', '-'),
                emp.get('email', '-'),
                emp.get('personal_email', '-') or '-',
                emp.get('department', 'Not assigned') or 'Not assigned',
                emp.get('position', 'Not assigned') or 'Not assigned',
                "Active" if emp.get('is_active', True) else "Deactivated" # Map boolean to string
            ])

        return export_data(data, headers, "employees", format_type)

    except Exception as e:
        app.logger.error(f"Error exporting employees: {str(e)}", exc_info=True)
        return redirect(url_for('admin_emp_manage', error=f'Failed to export employee data: {str(e)}'))


@app.route('/admin/export_attendance', methods=['GET']) # Existing route in admin_dashboard
@admin_required
def export_attendance():
    """Exports attendance data to CSV or XLSX format based on filters."""
    try:
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        emp_id_filter = request.args.get('emp_id', '').strip()
        status_filter = request.args.get('status', '').strip()
        format_type = request.args.get('format', 'xlsx').lower() # Default to xlsx

        # Now exclude only 'Historical' from default view. 'Regularized' and 'On Leave' are legitimate statuses.
        query = {"status": {"$nin": ["Historical"]}}

        if start_date:
            query['date'] = {'$gte': start_date}
        if end_date:
            query.setdefault('date', {}).update({'$lte': end_date})

        if emp_id_filter:
            user_ids_from_name_search = list(users_collection.find(
                {"full_name": {'$regex': emp_id_filter, '$options': 'i'}},
                {"emp_id": 1}
            ))
            matched_emp_ids = [u['emp_id'] for u in user_ids_from_name_search]

            if matched_emp_ids:
                query["emp_id"] = {"$in": matched_emp_ids}
            else:
                query["emp_id"] = emp_id_filter

        if status_filter:
            query['status'] = status_filter # Allow filtering specifically for Regularized or On Leave

        pipeline = [
            {'$match': query},
            {'$sort': {'date': -1, 'punch_in': 1}},
            {
                '$lookup': {
                    'from': 'users',
                    'localField': 'emp_id',
                    'foreignField': 'emp_id',
                    'as': 'user_info'
                }
            },
            {'$unwind': {'path': '$user_info', 'preserveNullAndEmptyArrays': True}},
            {
                '$project': {
                    'emp_id': 1,
                    'date': 1,
                    'punch_in': 1,
                    'punch_out': 1,
                    'punch_in_address': '$address',
                    'punch_out_address': '$punch_out_address',
                    'status': 1,
                    'full_name': {'$ifNull': ['$user_info.full_name', 'Unknown']}
                }
            }
        ]

        records = list(attendance_collection.aggregate(pipeline))

        headers = ["Employee Name", "Employee ID", "Date", "Punch In", "Punch Out",
                   "Punch In Location", "Punch Out Location", "Status"]
        data = []

        def format_time_for_export(time_str):
            """Helper to format ISO time strings to HH:MM:SS or return default."""
            try:
                if time_str:
                    return datetime.datetime.fromisoformat(time_str).strftime('%H:%M:%S')
            except ValueError:
                pass
            return '-'

        for rec in records:
            data.append([
                rec.get('full_name', '-'),
                rec.get('emp_id', '-'),
                datetime.datetime.fromisoformat(rec['date']).strftime('%Y-%m-%d') if rec.get('date') else '-',
                format_time_for_export(rec.get('punch_in')),
                format_time_for_export(rec.get('punch_out')),
                rec.get('punch_in_address', '-') or '-',
                rec.get('punch_out_address', '-') or '-',
                rec.get('status', '-') or '-'
            ])

        return export_data(data, headers, "attendance_records", format_type)

    except Exception as e:
        app.logger.error(f"Error exporting attendance: {str(e)}", exc_info=True)
        return redirect(url_for('admin_dashboard', error=f'Failed to export attendance data: {str(e)}'))


@app.route('/admin/export_regularization', methods=['GET']) # Existing route in admin_regularization
@admin_required
def export_regularization():
    """Exports regularization records to CSV or XLSX format based on filters."""
    try:
        employee_filter = request.args.get('employee', '').strip()
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        format_type = request.args.get('format', 'xlsx').lower() # Default to xlsx

        match_stage = {
            'status': 'Regularized'
        }
        if employee_filter:
            user_ids_from_name_search = list(users_collection.find(
                {"full_name": {'$regex': employee_filter, '$options': 'i'}},
                {"emp_id": 1}
            ))
            matched_emp_ids = [u['emp_id'] for u in user_ids_from_name_search]

            if matched_emp_ids:
                match_stage['$or'] = [{"emp_id": {"$in": matched_emp_ids}}]
            else:
                # If no name match, assume it's an exact ID search
                match_stage["emp_id"] = employee_filter

        if start_date:
            match_stage['date'] = {'$gte': start_date}
        if end_date:
            match_stage.setdefault('date', {}).update({'$lte': end_date})

        pipeline = [
            {'$match': match_stage},
            {'$sort': {'date': -1, 'regularized_at': -1}},
            {
                '$lookup': {
                    'from': 'users',
                    'localField': 'emp_id',
                    'foreignField': 'emp_id',
                    'as': 'user_info'
                }
            },
            {'$unwind': {'path': '$user_info', 'preserveNullAndEmptyArrays': True}},
            # MODIFICATION START: Updated lookup to get true original times from all relevant records
            {
                '$lookup': {
                    'from': 'attendance',
                    'let': {'emp_id_val': '$emp_id', 'date_val': '$date', 'current_record_id': '$_id'},
                    'pipeline': [
                        {"$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$emp_id", "$$emp_id_val"]},
                                    {"$eq": ["$date", "$$date_val"]},
                                    {"$ne": ["$_id", "$$current_record_id"]}, # Exclude the current regularized record
                                    {"$ne": ["$status", "On Leave"]}, # Exclude On Leave records
                                    {"$ne": ["$status", "Regularized"]} # Exclude Regularized records (we want original punches only)
                                ]
                            }
                        }},
                        # Group to find the overall min punch_in and max punch_out for the day from non-regularized, non-leave records
                        {'$group': {
                            '_id': None, # Group all other records for the day to find min/max
                            "min_punch_in": {"$min": "$punch_in"},
                            "max_punch_out": {"$max": "$punch_out"}
                        }}
                    ],
                    "as": "historical_summary"
                }
            },
            # MODIFICATION END
            {
                "$addFields": {
                    "historical": {"$arrayElemAt": ["$historical_summary", 0]},
                    "full_name": {"$ifNull": ["$user_info.full_name", "Unknown"]}
                }
            },
            {
                '$project': {
                    'emp_id': 1,
                    'full_name': 1,
                    'date': 1,
                    'original_punch_in': {'$ifNull': ['$historical.min_punch_in', '-']},
                    'original_punch_out': {'$ifNull': ['$historical.max_punch_out', '-']},
                    'modified_punch_in': '$punch_in',
                    'modified_punch_out': '$punch_out',
                    'regularized_reason': 1,
                    'status': 1,
                    'regularized_comments': 1
                }
            }
        ]

        records_to_export = list(attendance_collection.aggregate(pipeline))

        headers = ["Employee Name", "Employee ID", "Date",
                   "Original Punch In", "Original Punch Out",
                   "Modified Punch In", "Modified Punch Out",
                   "Reason", "Status", "Comments"]
        data = []

        def format_time_for_export(time_str):
            """Helper to format ISO time strings to HH:MM:SS or return default."""
            try:
                if time_str and time_str != '-':
                    return datetime.datetime.fromisoformat(time_str).strftime('%H:%M:%S')
            except ValueError:
                pass
            return '-'

        for r in records_to_export:
            data.append([
                r.get('full_name', '-'),
                r.get('emp_id', '-'),
                datetime.datetime.fromisoformat(r['date']).strftime('%Y-%m-%d') if r.get('date') else '-',
                format_time_for_export(r.get('original_punch_in')),
                format_time_for_export(r.get('original_punch_out')),
                format_time_for_export(r.get('modified_punch_in')),
                format_time_for_export(r.get('modified_punch_out')),
                r.get('regularized_reason', '-') or '-',
                r.get('status', '-') or '-',
                r.get('regularized_comments', '-') or '-'
            ])

        return export_data(data, headers, "regularization_records", format_type)

    except Exception as e:
        app.logger.error(f"Error exporting regularization records: {str(e)}", exc_info=True)
        return redirect(url_for('admin_regularization', error=f'Failed to export regularization data: {str(e)}'))

@app.route('/update_password', methods=['POST'])
@login_required # Apply login_required decorator
def update_password():
    """Allows an authenticated employee to change their password."""
    try:
        data = request.get_json()
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')

        if not all([current_password, new_password, confirm_password]):
            return jsonify({'success': False, 'message': 'All password fields are required.'}), 400

        if new_password != confirm_password:
            return jsonify({'success': False, 'message': 'New password and confirm password do not match.'}), 400

        is_strong, password_message = _validate_password_complexity(new_password)
        if not is_strong:
            return jsonify({'success': False, 'message': password_message}), 400

        emp_id = session['user']['emp_id']
        user = users_collection.find_one({'emp_id': emp_id})

        if not user or not check_password_hash(user['password'], current_password):
            return jsonify({'success': False, 'message': 'Current password is incorrect.'}), 401

        hashed_password = generate_password_hash(new_password)
        users_collection.update_one({'emp_id': emp_id}, {'$set': {'password': hashed_password}})
        
        # Send a confirmation email
        user_email = user.get('email')
        user_personal_email = user.get('personal_email')
        recipients = [email for email in [user_email, user_personal_email] if email]

        if recipients:
            email_title = "Security Alert: Your ArgusScan Password Was Changed"
            preheader = "Your password has been successfully changed. If this wasn't you, please secure your account."
            content_body = f"""
            <h2>Security Alert: Password Change</h2>
            <p>Hi {user.get('full_name')},</p>
            <p>This is a confirmation that the password for your ArgusScan account (Employee ID: <strong>{emp_id}</strong>) was changed just now.</p>
            <p>If this was you, you can safely ignore this email.</p>
            <p>If this wasn't you, your account may be compromised. We're here to help you secure your account. Please contact your administrator or IT support immediately.</p>
            <p>Thank you,<br>The ArgusScan Team</p>
            """
            html_body = create_html_email(email_title, preheader, content_body)

            send_email_with_retry(recipients, email_title, html_body) # Use the new retry function


        return jsonify({'success': True, 'message': 'Password updated successfully.'}), 200

    except Exception as e:
        app.logger.error(f"Error updating password for employee {session['user'].get('emp_id', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred while updating your password. Please try again.'}), 500

@app.route('/employee/api/profile', methods=['PUT'])
@login_required # Apply login_required decorator
def update_employee_profile():
    """Allows an authenticated employee to update their profile (e.g., personal email)."""
    try:
        data = request.get_json()
        personal_email = data.get('personal_email')
        emp_id = session['user']['emp_id']

        if personal_email:
            personal_email = personal_email.strip()
            if not _validate_email_format(personal_email):
                return jsonify({'success': False, 'message': 'Invalid personal email format.'}), 400
        else:
            personal_email = ""

        update_result = users_collection.update_one(
            {'emp_id': emp_id},
            {'$set': {'personal_email': personal_email}}
        )

        if update_result.matched_count == 0:
            return jsonify({'success': False, 'message': 'Employee not found or no changes were made.'}), 404

        session['user']['personal_email'] = personal_email

        return jsonify({'success': True, 'message': 'Profile updated successfully!'}), 200

    except Exception as e:
        app.logger.error(f"Error updating employee profile for {session['user'].get('emp_id', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'An unexpected error occurred while updating your profile: {str(e)}'}), 500

@app.route('/forgot_password', methods=['POST'])
def forgot_password():
    """Initiates password reset by sending an OTP to the user's personal email."""
    try:
        data = request.get_json()
        emp_id = data.get('empId', '').strip()
        personal_email = data.get('personalEmail', '').strip()

        if not emp_id or not personal_email:
            return jsonify({'success': False, 'message': 'Employee ID and personal email are required.'}), 400

        if len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
             return jsonify({'success': False, 'message': f'Employee ID must be at least {MIN_EMPLOYEE_ID_LENGTH} characters long.'}), 400
        if not _validate_email_format(personal_email):
            return jsonify({'success': False, 'message': 'Invalid personal email format.'}), 400

        user = users_collection.find_one({'emp_id': emp_id})

        if not user:
            return jsonify({'success': False, 'message': 'Employee ID not found.'}), 404

        if user.get('personal_email') != personal_email:
            return jsonify({'success': False, 'message': 'Provided personal email does not match our records for this Employee ID.'}), 400
        
        # Check if the account is active before allowing password reset
        if not user.get('is_active', True):
            return jsonify({'success': False, 'message': 'Your account is deactivated. Please contact your administrator.'}), 403

        otp = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        expiry_time = datetime.datetime.now() + datetime.timedelta(minutes=5)

        password_reset_tokens.update_one(
            {'emp_id': emp_id},
            {'$set': {'token': otp, 'expiry': expiry_time, 'created_at': datetime.datetime.now()}},
            upsert=True
        )

        email_title = "Your ArgusScan Verification Code"
        preheader = f"Your verification code is {otp}"
        content_body = f"""
        <h2>Password Reset Request</h2>
        <p>Hi,</p>
        <p>We received a request to reset the password for your ArgusScan account associated with Employee ID <strong>{emp_id}</strong>. Please use the verification code below to proceed.</p>
        <div class="otp-code">{otp}</div>
        <p>This code is valid for 5 minutes. If you did not request a password reset, please disregard this email or contact support if you have concerns.</p>
        <p>Thank you,<br>The ArgusScan Team</p>
        """
        html_body = create_html_email(email_title, preheader, content_body)
        
        email_sent_successfully = send_email_with_retry([personal_email], email_title, html_body) # Use the new retry function

        if not email_sent_successfully:
            return jsonify({'success': False, 'message': 'Failed to send verification code. Please check your email settings or try again later.'}), 500

        return jsonify({'success': True, 'message': 'A verification code has been sent to your personal email.'}), 200

    except Exception as e:
        app.logger.error(f"Error in forgot_password route: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred. Please try again.'}), 500


@app.route('/verify_reset_code', methods=['POST'])
def verify_reset_code():
    """Verifies the OTP sent for password reset."""
    try:
        data = request.get_json()
        emp_id = data.get('empId', '').strip()
        code = data.get('code', '').strip()

        if not emp_id or not code:
            return jsonify({'success': False, 'message': 'Employee ID and verification code are required.'}), 400

        token_entry = password_reset_tokens.find_one({'emp_id': emp_id})

        if not token_entry:
            return jsonify({'success': False, 'message': 'No verification code found for this Employee ID. Please request a new one.'}), 400

        expiry = token_entry.get('expiry')
        stored_token = token_entry.get('token')

        if not expiry or datetime.datetime.now() > expiry:
            password_reset_tokens.delete_one({'emp_id': emp_id})
            return jsonify({'success': False, 'message': 'The verification code has expired. Please request a new one.'}), 400

        if code == stored_token:
            return jsonify({'success': True, 'message': 'Verification code successfully verified.'}), 200
        else:
            return jsonify({'success': False, 'message': 'Invalid verification code.'}), 400

    except Exception as e:
        app.logger.error(f"Error in verify_reset_code route: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred during code verification. Please try again.'}), 500


@app.route('/reset_password', methods=['POST'])
def reset_password():
    """Resets the user's password after successful OTP verification."""
    try:
        data = request.get_json()
        emp_id = data.get('empId', '').strip()
        new_password = data.get('newPassword')

        if not emp_id or not new_password:
            return jsonify({'success': False, 'message': 'Employee ID and new password are required.'}), 400

        is_strong, password_message = _validate_password_complexity(new_password)
        if not is_strong:
            return jsonify({'success': False, 'message': password_message}), 400

        user = users_collection.find_one({'emp_id': emp_id})
        if not user:
            return jsonify({'success': False, 'message': 'Employee ID not found.'}), 404

        hashed_password = generate_password_hash(new_password)

        users_collection.update_one(
            {'emp_id': emp_id},
            {'$set': {'password': hashed_password}}
        )

        password_reset_tokens.delete_one({'emp_id': emp_id})

        # Send password has been reset email
        recipients = [e for e in [user.get('email'), user.get('personal_email')] if e]
        if recipients:
            email_title = "Your ArgusScan Password Has Been Reset"
            preheader = "Your password has been successfully reset."
            content_body = f"""
            <h2>Password Reset Successfully</h2>
            <p>Hi {user.get('full_name')},</p>
            <p>Your password for ArgusScan has been successfully reset.</p>
            <p>You can now log in with your new credentials. For security reasons, your new password is not included in this email.</p>
            <a href="{url_for('employee_login', _external=True)}" class="button">Login Now</a>
            <p>If you did not initiate this change, please contact an administrator immediately.</p>
            <p>Thank you,<br>The ArgusScan Team</p>
            """
            html_body = create_html_email(email_title, preheader, content_body)

            send_email_with_retry(recipients, email_title, html_body) # Use the new retry function


        return jsonify({'success': True, 'message': 'Your password has been successfully reset.'}), 200

    except Exception as e:
        app.logger.error(f"Error in reset_password route for employee {emp_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred during password reset. Please try again.'}), 500


@app.route('/admin/employees')
@admin_required
def admin_emp_manage():
    """Renders the admin employee management page."""
    return render_template('admin_emp_manage.html')

@app.route('/admin/api/employees', methods=['GET'])
@admin_required
def admin_api_employees():
    """API endpoint for managing employee data (fetch all)."""
    if request.method == 'GET':
        search = request.args.get('search', '').strip()
        department = request.args.get('department', '').strip()

        query = {}
        if search:
            regex = {'$regex': search, '$options': 'i'}
            query['$or'] = [
                {'full_name': regex},
                {'emp_id': regex},
                {'email': regex},
                {'personal_email': regex}
            ]
        if department:
            query['department'] = department

        employees = list(users_collection.find(query, {
            'emp_id': 1, 'full_name': 1, 'email': 1,
            'personal_email': 1, 'image_path': 1,
            'department': 1, 'position': 1,
            'is_active': 1 # Include is_active status
        }))

        result = []
        for emp in employees:
            image_url = url_for('uploaded_file', filename=os.path.basename(emp.get('image_path', ''))) if emp.get('image_path') and os.path.exists(emp.get('image_path')) else 'https://via.placeholder.com/40'
            result.append({
                'emp_id': emp.get('emp_id', '-'),
                'full_name': emp.get('full_name', '-'),
                'email': emp.get('email', '-'),
                'personal_email': emp.get('personal_email', '') or '-',
                'image_path': image_url,
                'department': emp.get('department', 'Not assigned') or 'Not assigned',
                'position': emp.get('position', 'Not assigned') or 'Not assigned',
                'is_active': emp.get('is_active', True) # Default to True if field is missing (for old records)
            })
        return jsonify(result), 200


@app.route('/admin/api/employees/<emp_id>', methods=['GET', 'PUT'])
@admin_required
def admin_api_single_employee(emp_id):
    """API endpoint for fetching or updating a single employee."""
    if not emp_id or len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
        return jsonify({'error': 'Invalid Employee ID provided in URL.'}), 400

    if request.method == 'GET':
        emp = users_collection.find_one({'emp_id': emp_id})
        if not emp:
            return jsonify({'error': 'Employee not found.'}), 404

        image_url = url_for('uploaded_file', filename=os.path.basename(emp.get('image_path', ''))) if emp.get('image_path') and os.path.exists(emp.get('image_path')) else 'https://via.placeholder.com/40'

        return jsonify({
            'emp_id': emp.get('emp_id', '-'),
            'full_name': emp.get('full_name', '-'),
            'email': emp.get('email', '-'),
            'personal_email': emp.get('personal_email', '') or '',
            'department': emp.get('department', 'Not assigned') or 'Not assigned',
            'position': emp.get('position', 'Not assigned') or 'Not assigned',
            'image_path': image_url,
            'is_active': emp.get('is_active', True) # Include active status
        }), 200

    elif request.method == 'PUT':
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No update data provided.'}), 400

        update_data = {}
        send_email_notification = data.get('send_email_notification', False) # Get checkbox state

        if 'fullName' in data:
            if not data['fullName'].strip():
                return jsonify({'error': 'Full Name cannot be empty.'}), 400
            update_data['full_name'] = data['fullName'].strip()

        if 'personalEmail' in data:
            personal_email = data['personalEmail'].strip()
            if personal_email and not _validate_email_format(personal_email):
                return jsonify({'error': 'Invalid personal email format.'}), 400
            update_data['personal_email'] = personal_email
        else: # Handle case where personal_email is explicitly set to empty string
            update_data['personal_email'] = ""


        if 'department' in data:
            update_data['department'] = data['department'].strip() if data['department'] else 'Not assigned'

        if 'position' in data:
            if not data['position'].strip():
                 return jsonify({'error': 'Position cannot be empty.'}), 400
            update_data['position'] = data['position'].strip() if data['position'] else 'Not assigned'

        if 'password' in data and data['password']:
            new_password = data['password']
            is_strong, password_message = _validate_password_complexity(new_password)
            if not is_strong:
                return jsonify({'error': password_message}), 400
            update_data['password'] = generate_password_hash(new_password)
        
        # Do not allow updating is_active via this generic update endpoint.
        # Use the dedicated /status endpoint for activation/deactivation.

        if not update_data:
            return jsonify({'error': 'No valid fields provided for update.'}), 400

        result = users_collection.update_one({'emp_id': emp_id}, {'$set': update_data})

        if result.modified_count > 0:
            if send_email_notification: # Only send email if checkbox was checked
                updated_user = users_collection.find_one({'emp_id': emp_id})
                recipients = [email for email in [updated_user.get('email'), updated_user.get('personal_email')] if email]
                
                if recipients:
                    changes_list_html = "<ul>"
                    if 'full_name' in update_data:
                        changes_list_html += f"<li><strong>Full Name:</strong> {update_data['full_name']}</li>"
                    if 'personal_email' in update_data:
                        changes_list_html += f"<li><strong>Personal Email:</strong> {update_data['personal_email'] or 'Removed'}</li>"
                    if 'department' in update_data:
                        changes_list_html += f"<li><strong>Department:</strong> {update_data['department']}</li>"
                    if 'position' in update_data:
                        changes_list_html += f"<li><strong>Position:</strong> {update_data['position']}</li>"
                    if 'password' in update_data:
                        changes_list_html += f"<li><strong>Password:</strong> Your password has been reset. For security reasons, the new password is not provided here.</li>"
                    changes_list_html += "</ul>"

                    email_title = "Your ArgusScan Profile Has Been Updated"
                    preheader = "An administrator has made changes to your employee profile."
                    content_body = f"""
                    <h2>Profile Update Notification</h2>
                    <p>Hi {updated_user.get('full_name')},</p>
                    <p>Please be advised that an administrator has updated your profile in the ArgusScan system. The following changes were made:</p>
                    {changes_list_html}
                    <p>If you have any questions or believe this was in error, please contact your manager or the HR department.</p>
                    <p>Thank you,<br>The ArgusScan Team</p>
                    """
                    html_body = create_html_email(email_title, preheader, content_body)

                    email_sent = send_email_with_retry(recipients, email_title, html_body) # Use the new retry function
                    if not email_sent:
                        return jsonify({'success': True, 'message': 'Employee updated successfully, but failed to send notification email.'}), 200


        if result.matched_count == 0:
            return jsonify({'error': 'Employee not found or no changes made.'}), 404
        if result.modified_count == 0 and result.matched_count == 1:
            return jsonify({'success': True, 'message': 'No changes detected, but request was valid.'}), 200

        return jsonify({'success': True, 'message': 'Employee updated successfully.'}), 200

# NEW ROUTE: For activating/deactivating employees
@app.route('/admin/api/employees/<emp_id>/status', methods=['PUT'])
@admin_required
def admin_api_employee_status(emp_id):
    """API endpoint for activating or deactivating a single employee."""
    try:
        data = request.get_json()
        new_status = data.get('status') # 'activate' or 'deactivate'
        send_email_notification = data.get('send_email_notification', False)

        if new_status not in ['activate', 'deactivate']:
            return jsonify({'success': False, 'message': 'Invalid status provided.'}), 400

        target_active_status = True if new_status == 'activate' else False

        employee = users_collection.find_one({'emp_id': emp_id})
        if not employee:
            return jsonify({'success': False, 'message': 'Employee not found.'}), 404
        
        # Prevent changing status if it's already the target status
        if employee.get('is_active', True) == target_active_status:
            action_verb = "activated" if target_active_status else "deactivated"
            return jsonify({'success': False, 'message': f'Employee account is already {action_verb}.'}), 200

        result = users_collection.update_one(
            {'emp_id': emp_id},
            {'$set': {'is_active': target_active_status}}
        )

        if result.modified_count > 0:
            status_verb = "activated" if target_active_status else "deactivated"
            message_prefix = f"Employee account {status_verb} successfully."

            if send_email_notification:
                recipients = [e for e in [employee.get('email'), employee.get('personal_email')] if e]
                if recipients:
                    email_subject = f"Your ArgusScan Account Has Been {status_verb.capitalize()}"
                    content_body = f"""
                    <h2>Account Status Update</h2>
                    <p>Hi {employee.get('full_name')},</p>
                    <p>This is to inform you that your ArgusScan employee account (Employee ID: <strong>{emp_id}</strong>) has been <strong>{status_verb}</strong> by an administrator.</p>
                    """
                    if not target_active_status: # Deactivated
                        content_body += "<p>You will no longer be able to log in or use the attendance system. All your historical data remains intact for auditing purposes.</p>"
                        content_body += "<p>If you have any questions, please contact your HR department or administrator.</p>"
                    else: # Activated
                        content_body += "<p>You can now log in and use the attendance system as usual.</p>"
                        content_body += f"<a href=\"{url_for('employee_login', _external=True)}\" class=\"button\">Login to Your Account</a>"
                        content_body += "<p>If you have any questions, please contact your administrator.</p>"
                        
                    content_body += "<p>Thank you,<br>The ArgusScan Team</p>"
                    html_body = create_html_email(email_subject, email_subject, content_body)

                    email_sent = send_email_with_retry(recipients, email_subject, html_body)
                    if not email_sent:
                        return jsonify({'success': True, 'message': f'{message_prefix} Failed to send notification email.'}), 200
                else:
                    return jsonify({'success': True, 'message': f'{message_prefix} No email address found to send notification.'}), 200
            
            return jsonify({'success': True, 'message': message_prefix}), 200
        else:
            return jsonify({'success': False, 'message': 'Failed to update employee status or no changes made.'}), 500

    except Exception as e:
        app.logger.error(f"Error updating employee status for {emp_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'An unexpected error occurred: {str(e)}'}), 500

# NEW ROUTE: For permanent deletion of employees
@app.route('/admin/api/employees/<emp_id>/permanent_delete', methods=['DELETE'])
@admin_required
def admin_api_permanent_delete_employee(emp_id):
    """API endpoint for permanently deleting an employee and all associated records."""
    try:
        employee = users_collection.find_one({'emp_id': emp_id})
        if not employee:
            return jsonify({'success': False, 'message': 'Employee not found.'}), 404
        
        data = request.get_json()
        send_email_notification = data.get('send_email_notification', False)

        image_path = employee.get('image_path')
        
        # Send deletion confirmation email before deleting the user record, ONLY IF checkbox is checked
        if send_email_notification:
            recipients = [e for e in [employee.get('email'), employee.get('personal_email')] if e]
            if recipients:
                email_title = "Account Deletion Confirmation"
                preheader = "Your ArgusScan account has been permanently deleted by an administrator."
                content_body = f"""
                <h2>Account Deletion Notice</h2>
                <p>Hi {employee.get('full_name')},</p>
                <p>This email is to confirm that your ArgusScan account (Employee ID: <strong>{emp_id}</strong>) has been permanently deleted by an administrator.</p>
                <p>All your associated data, including attendance records, have been removed from our system.</p>
                <p>If you believe this was done in error, please contact your administrator or the HR department immediately.</p>
                <p>Thank you,<br>The ArgusScan Team</p>
                """
                html_body = create_html_email(email_title, preheader, content_body)

                email_sent = send_email_with_retry(recipients, email_title, html_body)
                if not email_sent:
                    app.logger.warning(f"Permanent deletion email failed for {emp_id}, but proceeding with deletion.")

        # Now, delete the user and their records
        users_collection.delete_one({'emp_id': emp_id})
        attendance_collection.delete_many({'emp_id': emp_id})
        password_reset_tokens.delete_many({'emp_id': emp_id})
        leave_requests_collection.delete_many({'emp_id': emp_id})

        if image_path and not image_path.startswith(('http://', 'https://')) and os.path.exists(image_path):
            try:
                os.remove(image_path)
                dir_path = os.path.dirname(image_path)
                if os.path.exists(dir_path) and not os.listdir(dir_path):
                    os.rmdir(dir_path)
            except OSError as e:
                app.logger.error(f"Error deleting employee photo file {image_path}: {e}")
                return jsonify({
                    'success': True,
                    'warning': f'Employee deleted but photo file could not be removed: {e}'
                }), 200
            except Exception as e:
                app.logger.error(f"Unexpected error deleting employee photo {image_path}: {e}")
                return jsonify({
                    'success': True,
                    'warning': f'Employee deleted but an unexpected error occurred while removing photo: {e}'
                }), 200

        return jsonify({'success': True, 'message': 'Employee and all associated records permanently deleted.'}), 200

    except Exception as e:
        app.logger.error(f"Error permanently deleting employee {emp_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'An unexpected error occurred during permanent deletion: {str(e)}'}), 500


@app.route('/admin/send_employee_email', methods=['POST'])
@admin_required
def send_employee_email():
    """Allows admin to send an email to an employee."""
    try:
        data = request.get_json()
        to = data.get('to')
        subject = data.get('subject')
        message = data.get('message')

        if not all([to, subject, message]):
            return jsonify({'success': False, 'message': 'Missing recipient, subject, or message body.'}), 400

        if not _validate_email_format(to):
            return jsonify({'success': False, 'message': 'Invalid recipient email format.'}), 400

        html_body = create_html_email(subject, subject, message) # Re-use template for general emails

        email_sent = send_email_with_retry([to], subject, html_body) # Use the new retry function

        if not email_sent:
            return jsonify({'success': False, 'message': f'Failed to send email after multiple attempts.'}), 500

        return jsonify({'success': True, 'message': 'Email sent successfully!'}), 200
    except Exception as e:
        app.logger.error(f"Error sending email from admin panel to {to}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'Failed to send email: {str(e)}'}), 500

@app.route('/admin/api/send_report_email', methods=['POST'])
@admin_required
def admin_api_send_report_email():
    """Allows admin to send an attendance report email with an Excel attachment."""
    try:
        data = request.get_json()
        to_email = data.get('to')
        subject = data.get('subject')
        message_body = data.get('message')
        report_data = data.get('report_data', [])
        report_headers = data.get('report_headers', [])
        report_filename = data.get('report_filename', 'report.xlsx')

        if not all([to_email, subject, message_body]):
            return jsonify({'success': False, 'message': 'Missing recipient, subject, or message body.'}), 400

        if not _validate_email_format(to_email):
            return jsonify({'success': False, 'message': 'Invalid recipient email format.'}), 400

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = os.getenv("SENDGRID_SENDER_EMAIL")
        msg['To'] = to_email
        msg.set_content(message_body, subtype='html')

        # Create and attach the Excel file if data is provided
        if report_data and report_headers:
            output = io.BytesIO()
            # Ensure report_data is a list of lists, aligning with headers
            df = pd.DataFrame(report_data, columns=report_headers)
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                df.to_excel(writer, index=False, sheet_name='Report')
                # Auto-adjust columns' width
                for column in df:
                    column_width = max(df[column].astype(str).map(len).max(), len(column))
                    col_idx = df.columns.get_loc(column)
                    writer.sheets['Report'].set_column(col_idx, col_idx, column_width + 2)
            
            output.seek(0)
            msg.add_attachment(output.read(), 
                               maintype='application', 
                               subtype='vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                               filename=report_filename)

        try:
            with smtplib.SMTP('smtp.sendgrid.net', 587) as server:
                server.starttls()
                server.login("apikey", os.getenv("SENDGRID_API_KEY"))
                server.send_message(msg)
            app.logger.info(f"Report email sent successfully to {to_email}")
            return jsonify({'success': True, 'message': 'Attendance report email sent successfully!'}), 200
        except Exception as e:
            app.logger.error(f"Failed to send report email to {to_email}: {e}", exc_info=True)
            return jsonify({'success': False, 'message': f'Failed to send report email: {str(e)}'}), 500

    except Exception as e:
        app.logger.error(f"Error sending report email to {to_email}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'Failed to send report email: {str(e)}'}), 500

@app.route('/admin/api/employee_personal_emails', methods=['GET'])
@admin_required
def get_employee_personal_emails():
    """API endpoint to get employee full names and personal emails."""
    try:
        # Only fetch active employees for reporting purposes
        employees = users_collection.find({"personal_email": {"$ne": ""}, "is_active": True}, {"full_name": 1, "personal_email": 1, "emp_id": 1})
        result = []
        for emp in employees:
            result.append({
                'full_name': emp.get('full_name'),
                'personal_email': emp.get('personal_email'),
                'emp_id': emp.get('emp_id')
            })
        return jsonify(result), 200
    except Exception as e:
        app.logger.error(f"Error fetching employee personal emails: {e}")
        return jsonify({"success": False, "message": "Failed to fetch employee personal emails."}), 500

@app.route('/admin/api/attendance_records_for_employee', methods=['GET'])
@admin_required
def get_attendance_records_for_employee():
    """API endpoint to get attendance records for a specific employee (for reports)."""
    emp_id = request.args.get('emp_id')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    if not emp_id:
        return jsonify({"success": False, "message": "Employee ID is required."}), 400

    # Fetch all records for the employee within the date range, including Historical, Regularized, and On Leave
    query_filter = {"emp_id": emp_id}

    if start_date_str:
        query_filter["date"] = {"$gte": start_date_str}
    if end_date_str:
        query_filter.setdefault("date", {}).update({"$lte": end_date_str})

    try:
        # Fetch user details to get full_name
        user_info = users_collection.find_one({"emp_id": emp_id})
        full_name = user_info.get('full_name', 'Unknown') if user_info else 'Unknown'

        records = list(attendance_collection.find(query_filter).sort([("date", -1), ("punch_in", 1)]))

        # Define the exact order of headers for the report and Excel export
        report_headers = ["Employee Name", "Employee ID", "Date", "Punch In", "Punch Out", "Punch In Location", "Punch Out Location", "Status"]
        
        formatted_records_list_of_lists = [] # This will be the list of lists

        for record in records:
            # Re-resolve punch_in_address and punch_out_address if they are "Location not recorded"
            # or if latitude/longitude are available
            punch_in_address = record.get('address')
            if not punch_in_address or punch_in_address == 'Location not recorded':
                punch_in_lat = record.get('latitude')
                punch_in_lng = record.get('longitude')
                if punch_in_lat and punch_in_lng:
                    punch_in_address = reverse_geocode(punch_in_lat, punch_in_lng)
                else:
                    punch_in_address = "Location not recorded"

            punch_out_address = record.get('punch_out_address')
            if not punch_out_address or punch_out_address == 'Location not recorded':
                punch_out_lat = record.get('punch_out_latitude')
                punch_out_lng = record.get('punch_out_longitude')
                if punch_out_lat and punch_out_lng:
                    punch_out_address = reverse_geocode(punch_out_lat, punch_out_lng)
                else:
                    punch_out_address = "Location not recorded"

            formatted_records_list_of_lists.append([
                full_name,
                record['emp_id'],
                datetime.datetime.fromisoformat(record['date']).strftime('%Y-%m-%d'),
                datetime.datetime.fromisoformat(record['punch_in']).strftime('%H:%M:%S') if record.get('punch_in') else '-',
                datetime.datetime.fromisoformat(record['punch_out']).strftime('%H:%M:%S') if record.get('punch_out') else '-',
                punch_in_address,
                punch_out_address,
                record.get('status', '-')
            ])
        return jsonify(formatted_records_list_of_lists), 200 # Return list of lists, not dictionaries
    except Exception as e:
        app.logger.error(f"Error fetching attendance records for employee {emp_id}: {e}")
        return jsonify({"success": False, "message": "Failed to fetch attendance records."}), 500

@app.route('/admin/api/regularization_records_for_employee', methods=['GET'])
@admin_required
def get_regularization_records_for_employee():
    """API endpoint to get regularization records for a specific employee (for reports)."""
    emp_id = request.args.get('emp_id')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    if not emp_id:
        return jsonify({"success": False, "message": "Employee ID is required."}), 400

    match_query = {"emp_id": emp_id, "status": "Regularized"}

    if start_date_str:
        match_query["date"] = {"$gte": start_date_str}
    if end_date_str:
        match_query.setdefault("date", {}).update({"$lte": end_date_str})

    try:
        pipeline = [
            {"$match": match_query},
            {"$sort": {"date": -1, "regularized_at": -1}},
            {
                "$lookup": {
                    "from": "attendance",
                    "let": {"emp_id_val": "$emp_id", "date_val": "$date", "current_record_id": "$_id"},
                    "pipeline": [
                        {"$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$emp_id", "$$emp_id_val"]},
                                    {"$eq": ["$date", "$$date_val"]},
                                    {"$ne": ["$_id", "$$current_record_id"]}, # Exclude the current regularized record
                                    {"$ne": ["$status", "On Leave"]}, # Exclude On Leave records
                                    {"$ne": ["$status", "Regularized"]} # Exclude Regularized records (we want original punches only)
                                ]
                            }
                        }},
                        # Group to find the overall min punch_in and max punch_out for the day from non-regularized, non-leave records
                        {'$group': {
                            '_id': None,
                            "min_punch_in": {"$min": "$punch_in"},
                            "max_punch_out": {"$max": "$punch_out"}
                        }}
                    ],
                    "as": "historical_summary_for_day" # Changed alias to avoid confusion with single historical record
                }
            },
            {
                "$addFields": {
                    "historical_data_for_day": {"$arrayElemAt": ["$historical_summary_for_day", 0]},
                }
            },
            {
                '$project': {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": {"$dateFromString": {"dateString": "$date"}}}},
                    # Use the aggregated min/max for original times
                    "original_punch_in": {"$ifNull": ["$historical_data_for_day.min_punch_in", "-"]},
                    "original_punch_out": {"$ifNull": ["$historical_data_for_day.max_punch_out", "-"]},
                    "modified_punch_in": "$punch_in",
                    "modified_punch_out": "$punch_out",
                    "regularized_reason": "$regularized_reason",
                    "regularized_comments": {"$ifNull": ["$regularized_comments", "-"]}
                }
            }
        ]

        records = list(attendance_collection.aggregate(pipeline))

        def format_time_for_display(val):
            try:
                if val and val != '-':
                    return datetime.datetime.fromisoformat(val).strftime('%H:%M:%S')
            except ValueError:
                pass
            return val or '-'

        # Frontend expects specific keys (Date, Original In, etc.), map them correctly
        report_headers = ["Date", "Original In", "Original Out", "Modified In", "Modified Out", "Reason", "Comments"]
        formatted_records_list_of_lists = []
        for record in records:
            formatted_records_list_of_lists.append([
                record['date'],
                format_time_for_display(record['original_punch_in']),
                format_time_for_display(record['original_punch_out']),
                format_time_for_display(record['modified_punch_in']),
                format_time_for_display(record['modified_punch_out']),
                record['regularized_reason'] if record.get('regularized_reason') else '-',
                record['regularized_comments'] if record.get('regularized_comments') else '-'
            ])

        return jsonify(formatted_records_list_of_lists), 200 # Return the correctly formatted list
    except Exception as e:
        app.logger.error(f"Error fetching regularization records for employee {emp_id}: {e}")
        return jsonify({"success": False, "message": "Failed to fetch regularization records."}), 500

@app.route('/admin/bulk_upload_process', methods=['POST'])
@admin_required
def bulk_upload_process():
    if 'importFile' not in request.files:
        return jsonify({'error': 'No data file part in the request.'}), 400
    
    data_file = request.files['importFile']
    image_files = request.files.getlist('importImages')

    if data_file.filename == '' or not allowed_file(data_file.filename):
        return jsonify({'error': 'No selected data file or file type not allowed (must be .csv or .xlsx).'}), 400

    if not image_files or image_files[0].filename == '':
        return jsonify({'error': 'No image files selected.'}), 400

    session_id = datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')
    temp_dir = os.path.join(app.config['TEMP_UPLOAD_FOLDER'], session_id)
    images_subdir = os.path.join(temp_dir, 'images')
    os.makedirs(images_subdir, exist_ok=True)

    data_filepath = os.path.join(temp_dir, secure_filename(data_file.filename))
    
    try:
        data_file.save(data_filepath)
        for img in image_files:
            if img:
                img.save(os.path.join(images_subdir, secure_filename(img.filename)))

        summary = _process_folder(temp_dir)

        return jsonify(summary), 200

    except Exception as e:
        app.logger.error(f"Error in bulk_upload_process: {e}", exc_info=True)
        return jsonify({'error': f'An unexpected error occurred: {str(e)}'}), 500
    finally:
        force_remove_directory(temp_dir)


@app.route('/admin/trigger_loader_job', methods=['POST'])
@admin_required
def trigger_loader_job():
    try:
        # Check if the shared folder exists and has content before processing
        if not os.path.exists(app.config['SHARED_LOADER_PATH']) or not os.listdir(app.config['SHARED_LOADER_PATH']):
            return jsonify({'successful': 0, 'failed': 0, 'message': 'Shared folder is empty or does not exist.'}), 200
        
        summary = _process_folder(app.config['SHARED_LOADER_PATH'], is_cron_job=True)
        return jsonify(summary), 200
    except Exception as e:
        app.logger.error(f"Error triggering loader job manually: {e}", exc_info=True)
        return jsonify({'error': f'An unexpected error occurred: {str(e)}'}), 500

def _process_folder(folder_path, is_cron_job=False):
    successful_imports = 0
    failed_imports = 0
    errors = []
    
    data_file_path = None
    files_in_dir = os.listdir(folder_path)
    for f in files_in_dir:
        if allowed_file(f):
            data_file_path = os.path.join(folder_path, f)
            break
            
    if not data_file_path:
        return {'successful': 0, 'failed': 0, 'message': 'No data file (.csv or .xlsx) found in the directory.'}

    image_base_path = os.path.join(folder_path, 'images')
    if not os.path.isdir(image_base_path):
        return {'successful': 0, 'failed': 0, 'message': "An 'images' subdirectory was not found."}

    try:
        if data_file_path.endswith('.csv'):
            df = pd.read_csv(data_file_path)
        else:
            df = pd.read_excel(data_file_path)
        
        employee_data_list = df.to_dict('records')
    except Exception as e:
        return {'successful': 0, 'failed': 0, 'message': f'Failed to read data file: {str(e)}'}

    for emp_data in employee_data_list:
        is_success, message = _register_employee_from_data(emp_data, image_base_path)
        if is_success:
            successful_imports += 1
        else:
            failed_imports += 1
            errors.append(message)
    
    if is_cron_job and (successful_imports > 0 or failed_imports > 0):
        archive_dir = os.path.join(app.config['SHARED_LOADER_PATH'], 'archive')
        os.makedirs(archive_dir, exist_ok=True)
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        destination_folder = os.path.join(archive_dir, timestamp)
        
        os.makedirs(destination_folder, exist_ok=True)
        # Move both data file and the 'images' subdirectory
        shutil.move(data_file_path, os.path.join(destination_folder, os.path.basename(data_file_path)))
        if os.path.exists(image_base_path):
             shutil.move(image_base_path, os.path.join(destination_folder, 'images'))


    summary = {
        'successful': successful_imports,
        'failed': failed_imports,
        'message': f"Processing complete. Success: {successful_imports}, Failed: {failed_imports}.",
        'errors': errors
    }
    return summary

@app.route('/logout')
def logout():
    """Logs out the employee user."""
    session.pop('user', None)
    return redirect(url_for('home'))

# New: Employee Leave Management Routes
@app.route('/employee/request_leave', methods=['GET', 'POST'])
@login_required
def request_leave():
    """Renders the leave request form and handles submission."""
    emp_id = session['user']['emp_id']
    
    if request.method == 'GET':
        # Fetch leave records for the history tab
        leave_records = list(leave_requests_collection.find({"emp_id": emp_id}).sort("request_date", -1))
        for record in leave_records:
            record['request_date_formatted'] = datetime.datetime.fromisoformat(record['request_date']).strftime('%Y-%m-%d %H:%M')
            record['start_date_formatted'] = datetime.datetime.fromisoformat(record['start_date']).strftime('%Y-%m-%d')
            record['end_date_formatted'] = datetime.datetime.fromisoformat(record['end_date']).strftime('%Y-%m-%d')
            record['id'] = str(record['_id'])
        
        return render_template('employee_leave.html', user=session['user'], leave_records=leave_records)

    elif request.method == 'POST':
        data = request.get_json()
        
        full_name = session['user']['username']
        email = session['user']['email']
        personal_email = session['user']['personal_email']

        leave_type = data.get('leaveType')
        start_date_str = data.get('startDate')
        end_date_str = data.get('endDate')
        reason = data.get('reason')
        comments = data.get('comments')

        # Server-side validation
        if not all([leave_type, start_date_str, end_date_str, reason]):
            return jsonify({"success": False, "message": "All required fields must be provided."}), 400
        
        try:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({"success": False, "message": "Invalid date format. Use YYYY-MM-DD."}), 400
        
        if start_date > end_date:
            return jsonify({"success": False, "message": "Start date cannot be after end date."}), 400

        # Check for overlapping leaves for the employee with "Pending" or "Approved" status
        overlapping_leave = leave_requests_collection.find_one({
            "emp_id": emp_id,
            "status": {"$in": ["Pending", "Approved"]},
            "$or": [
                {"start_date": {"$lte": end_date.isoformat()}, "end_date": {"$gte": start_date.isoformat()}}
            ]
        })
        if overlapping_leave:
            return jsonify({"success": False, "message": "You already have a pending or approved leave request overlapping with these dates."}), 400

        leave_requests_collection.insert_one({
            "emp_id": emp_id,
            "full_name": full_name,
            "email": email,
            "personal_email": personal_email,
            "leave_type": leave_type,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "reason": reason,
            "comments": comments,
            "request_date": datetime.datetime.now().isoformat(),
            "status": "Pending", # Initial status
            "admin_comment": ""
        })
        
        # Send notification to admin (optional, but good practice)
        admin_users = admins_collection.find({})
        # Collecting admin usernames which are assumed to be their email addresses
        admin_emails = [a["username"] for a in admin_users if a.get("username")]
        if admin_emails:
            admin_subject = f"New Leave Request from {full_name} ({emp_id})"
            admin_content = f"""
            <p>A new leave request has been submitted by {full_name} (Employee ID: {emp_id}).</p>
            <ul>
                <li>Leave Type: {leave_type}</li>
                <li>Start Date: {start_date_str}</li>
                <li>End Date: {end_date_str}</li>
                <li>Reason: {reason}</li>
            </ul>
            <p>Please review the request in the admin panel.</p>
            <a href="{url_for('admin_leave_management', _external=True)}" class="button">View Leave Requests</a>
            """
            send_email_with_retry(admin_emails, admin_subject, create_html_email(admin_subject, admin_subject, admin_content))

        return jsonify({"success": True, "message": "Leave request submitted successfully!."}), 200
    return render_template('employee_leave.html', user=session['user'])

# New: API endpoint for employee to fetch a single leave request
@app.route('/employee/api/leave_requests/<request_id>', methods=['GET'])
@login_required
def get_employee_leave_request(request_id):
    try:
        emp_id = session['user']['emp_id']
        leave_request = leave_requests_collection.find_one({"_id": ObjectId(request_id), "emp_id": emp_id})
        if not leave_request:
            return jsonify({"success": False, "message": "Leave request not found or you don't have permission."}), 404

        # Format dates for displaying in the modal
        leave_request['request_date_formatted'] = datetime.datetime.fromisoformat(leave_request['request_date']).strftime('%Y-%m-%d %H:%M')
        leave_request['start_date_formatted'] = datetime.datetime.fromisoformat(leave_request['start_date']).strftime('%Y-%m-%d')
        leave_request['end_date_formatted'] = datetime.datetime.fromisoformat(leave_request['end_date']).strftime('%Y-%m-%d')
        leave_request['id'] = str(leave_request['_id']) # Convert ObjectId to string

        return jsonify({
            "success": True,
            "id": leave_request['id'],
            "leave_type": leave_request['leave_type'],
            "start_date_formatted": leave_request['start_date_formatted'],
            "end_date_formatted": leave_request['end_date_formatted'],
            "reason": leave_request['reason'],
            "comments": leave_request.get('comments', ''),
            "status": leave_request['status']
        }), 200
    except Exception as e:
        app.logger.error(f"Error fetching employee leave request {request_id}: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": f"An unexpected error occurred: {str(e)}"}), 500

# New: API endpoint for employee to update a leave request
@app.route('/employee/api/leave_requests/<request_id>', methods=['PUT'])
@login_required
def update_employee_leave_request(request_id):
    try:
        data = request.get_json()
        emp_id = session['user']['emp_id']

        leave_type = data.get('leaveType')
        start_date_str = data.get('startDate')
        end_date_str = data.get('endDate')
        reason = data.get('reason')
        comments = data.get('comments')

        if not all([leave_type, start_date_str, end_date_str, reason]):
            return jsonify({"success": False, "message": "All required fields must be provided."}), 400
        
        try:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({"success": False, "message": "Invalid date format. Use YYYY-MM-DD."}), 400
        
        if start_date > end_date:
            return jsonify({"success": False, "message": "Start date cannot be after end date."}), 400

        # Find the existing request and ensure it belongs to the logged-in user and is still pending
        existing_request = leave_requests_collection.find_one({"_id": ObjectId(request_id), "emp_id": emp_id})
        if not existing_request:
            return jsonify({"success": False, "message": "Leave request not found or you don't have permission to modify it."}), 404
        
        if existing_request['status'] != 'Pending':
            return jsonify({"success": False, "message": f"This leave request is already {existing_request['status']} and cannot be modified."}), 400
        
        # Check for overlapping leave with other pending/approved leaves (excluding itself)
        overlapping_leave_query = {
            "emp_id": emp_id,
            "status": {"$in": ["Pending", "Approved"]},
            "_id": {"$ne": ObjectId(request_id)}, # Exclude the current request being updated
            "$or": [
                {"start_date": {"$lte": end_date.isoformat()}, "end_date": {"$gte": start_date.isoformat()}}
            ]
        }
        overlapping_leave = leave_requests_collection.find_one(overlapping_leave_query)
        
        if overlapping_leave:
            return jsonify({"success": False, "message": "Your updated leave request overlaps with another pending or approved leave."}), 400

        update_result = leave_requests_collection.update_one(
            {"_id": ObjectId(request_id), "emp_id": emp_id},
            {"$set": {
                "leave_type": leave_type,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "reason": reason,
                "comments": comments,
                "updated_at": datetime.datetime.now().isoformat() # Track when it was last updated
            }}
        )

        if update_result.modified_count == 0:
            return jsonify({"success": True, "message": "No changes detected for the leave request."}), 200

        return jsonify({"success": True, "message": "Leave request updated successfully!"}), 200

    except Exception as e:
        app.logger.error(f"Error updating employee leave request {request_id}: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": f"An unexpected error occurred: {str(e)}"}), 500

# New: API endpoint for employee to delete a leave request
@app.route('/employee/api/leave_requests/<request_id>', methods=['DELETE'])
@login_required
def delete_employee_leave_request(request_id):
    try:
        emp_id = session['user']['emp_id']
        
        # Find the existing request and ensure it belongs to the logged-in user and is still pending
        existing_request = leave_requests_collection.find_one({"_id": ObjectId(request_id), "emp_id": emp_id})
        if not existing_request:
            return jsonify({"success": False, "message": "Leave request not found or you don't have permission to delete it."}), 404
        
        if existing_request['status'] != 'Pending':
            return jsonify({"success": False, "message": f"This leave request is already {existing_request['status']} and cannot be deleted."}), 400

        delete_result = leave_requests_collection.delete_one({"_id": ObjectId(request_id), "emp_id": emp_id})

        if delete_result.deleted_count == 0:
            return jsonify({"success": False, "message": "Leave request not found or could not be deleted."}), 404

        return jsonify({"success": True, "message": "Leave request deleted successfully."}), 200

    except Exception as e:
        app.logger.error(f"Error deleting employee leave request {request_id}: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": f"An unexpected error occurred: {str(e)}"}), 500

# Remove this redirect, as request_leave will now be the combined page.
# @app.route('/employee/leave_history')
# @login_required
# def leave_history():
#     """Renders the employee's leave request history page.
#     This route is now largely redundant as /employee/request_leave serves the combined page."""
#     
#     # Redirect to the combined page
#     return redirect(url_for('request_leave'))


# New: Admin Leave Management Routes
@app.route('/admin/leave_management')
@admin_required
def admin_leave_management():
    """Renders the admin leave management page to review and act on leave requests."""
    employee_filter = request.args.get('employee', '').strip()
    status_filter = request.args.get('status', '').strip()
    start_date_filter = request.args.get('start_date', '').strip()
    end_date_filter = request.args.get('end_date', '').strip()
    page = int(request.args.get('page', 1))
    per_page = 10 # This line already exists and defines per_page

    query = {}
    if employee_filter:
        user_ids_from_name_search = [u['emp_id'] for u in users_collection.find(
            {"full_name": {'$regex': employee_filter, '$options': 'i'}}, {"emp_id": 1}
        )]
        emp_ids_to_filter = user_ids_from_name_search + ([employee_filter] if employee_filter not in user_ids_from_name_search else [])
        query["emp_id"] = {"$in": emp_ids_to_filter}
    
    if status_filter:
        query["status"] = status_filter
    
    if start_date_filter:
        query["start_date"] = {"$gte": start_date_filter}
    if end_date_filter:
        query.setdefault("end_date", {}).update({"$lte": end_date_filter})

    total_records = leave_requests_collection.count_documents(query)
    total_pages = (total_records + per_page - 1) // per_page
    skip = (page - 1) * per_page

    leave_requests = list(leave_requests_collection.find(query).sort("request_date", -1).skip(skip).limit(per_page))

    for req in leave_requests:
        req['request_date_formatted'] = datetime.datetime.fromisoformat(req['request_date']).strftime('%Y-%m-%d %H:%M')
        req['start_date_formatted'] = datetime.datetime.fromisoformat(req['start_date']).strftime('%Y-%m-%d')
        req['end_date_formatted'] = datetime.datetime.fromisoformat(req['end_date']).strftime('%Y-%m-%d')
        req['id'] = str(req['_id']) # Convert ObjectId to string for JSON/HTML
    
    status_options = sorted(list(leave_requests_collection.distinct("status", {"status": {"$ne": None}})))

    return render_template('admin_leave_management.html',
                           leave_requests=leave_requests,
                           employee_filter=employee_filter,
                           status_filter=status_filter,
                           start_date=start_date_filter,
                           end_date=end_date_filter,
                           status_options=status_options,
                           total_records=total_records,
                           total_pages=total_pages,
                           page=page,
                           per_page=per_page)

@app.route('/admin/api/leave_requests/<request_id>', methods=['PUT'])
@admin_required
def update_leave_request_status(request_id):
    """API endpoint for admin to update the status of a leave request (Approve/Reject)."""
    try:
        data = request.get_json()
        new_status = data.get('status')
        admin_comment = data.get('adminComment', '').strip()
        
        if new_status not in ["Approved", "Rejected"]:
            return jsonify({"success": False, "message": "Invalid status provided."}), 400
        
        # Use ObjectId to query by MongoDB's _id
        leave_request = leave_requests_collection.find_one({"_id": ObjectId(request_id)})
        if not leave_request:
            return jsonify({"success": False, "message": "Leave request not found."}), 404

        # Update the leave request
        update_result = leave_requests_collection.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {
                "status": new_status,
                "admin_comment": admin_comment,
                "reviewed_by": session['admin_username'], # Record who reviewed it
                "reviewed_at": datetime.datetime.now().isoformat()
            }}
        )

        if update_result.modified_count == 0:
            return jsonify({"success": False, "message": "No changes made or request already in this status."}), 200

        # If approved, update attendance records for the duration of the leave
        if new_status == "Approved":
            emp_id = leave_request['emp_id']
            # Parse dates from stored ISO format
            start_date_obj = datetime.datetime.fromisoformat(leave_request['start_date']).date()
            end_date_obj = datetime.datetime.fromisoformat(leave_request['end_date']).date()

            current_date = start_date_obj
            while current_date <= end_date_obj:
                iso_date = current_date.isoformat()
                
                # Check for existing attendance records for this employee on this date
                # We prioritize actual punches, regularized records.
                # Only if the day is currently "Absent" or doesn't have any punches, we mark it "On Leave".
                existing_record_on_date = attendance_collection.find_one(
                    {"emp_id": emp_id, "date": iso_date}
                )

                if existing_record_on_date:
                    # If there's an existing record and it's not already on leave, update it IF it's absent
                    # or if the existing status is 'Historical' (meaning a regularization was reverted or similar).
                    # We DON'T want to overwrite 'Active', 'Completed', 'Present', 'Regularized'.
                    if existing_record_on_date.get('status') in ['Absent', None, 'Historical']:
                        attendance_collection.update_one(
                            {"_id": existing_record_on_date["_id"]},
                            {"$set": {
                                "status": "On Leave",
                                "punch_in": None,
                                "punch_out": None,
                                "latitude": None,
                                "longitude": None,
                                "address": f"On Leave ({leave_request['leave_type']})",
                                "leave_request_id": request_id # Link to the leave request
                            }}
                        )
                else:
                    # If no record exists for this day, insert a new one marked as "On Leave"
                    attendance_collection.insert_one({
                        "emp_id": emp_id,
                        "date": iso_date,
                        "punch_in": None,
                        "punch_out": None,
                        "latitude": None,
                        "longitude": None,
                        "address": f"On Leave ({leave_request['leave_type']})",
                        "status": "On Leave",
                        "leave_request_id": request_id # Link to the leave request
                    })
                current_date += datetime.timedelta(days=1)
        
        # Send email notification to employee about status change
        employee_recipients = [e for e in [leave_request['email'], leave_request['personal_email']] if e]
        if employee_recipients:
            email_subject = f"Your Leave Request Status: {new_status}"
            req_start_date_formatted = datetime.datetime.fromisoformat(leave_request['start_date']).strftime('%Y-%m-%d')
            req_end_date_formatted = datetime.datetime.fromisoformat(leave_request['end_date']).strftime('%Y-%m-%d')

            content_body = f"""
            <h2>Your Leave Request Status Update</h2>
            <p>Dear {leave_request['full_name']},{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} PST</p>
            <p>Your leave request for <strong>{leave_request['leave_type']}</strong> from <strong>{req_start_date_formatted}</strong> to <strong>{req_end_date_formatted}</strong> has been <strong>{new_status.lower()}</strong>.</p>
            <p><strong>Reason Submitted:</strong> {leave_request['reason']}</p>
            {"<p><strong>Comments:</strong> " + admin_comment + "</p>" if admin_comment else ""}
            <p>You can view your leave history and attendance records in the employee portal.</p>
            <a href="{url_for('request_leave', _external=True)}" class="button">View My Leave History</a>
            """
            html_body = create_html_email(email_subject, email_subject, content_body)
            send_email_with_retry(employee_recipients, email_subject, html_body)

        return jsonify({"success": True, "message": f"Leave request {new_status.lower()} successfully."}), 200

    except Exception as e:
        app.logger.error(f"Error updating leave request status for {request_id}: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/admin/export_leaves', methods=['GET'])
@admin_required
def export_leaves():
    """Exports leave request records to CSV or XLSX format based on filters."""
    try:
        employee_filter = request.args.get('employee', '').strip()
        status_filter = request.args.get('status', '').strip()
        start_date_filter = request.args.get('start_date', '').strip()
        end_date_filter = request.args.get('end_date', '').strip()
        format_type = request.args.get('format', 'xlsx').lower()

        query = {}
        if employee_filter:
            user_ids_from_name_search = [u['emp_id'] for u in users_collection.find(
                {"full_name": {'$regex': employee_filter, '$options': 'i'}}, {"emp_id": 1}
            )]
            emp_ids_to_filter = user_ids_from_name_search + ([employee_filter] if employee_filter not in user_ids_from_name_search else [])
            query["emp_id"] = {"$in": emp_ids_to_filter}
        
        if status_filter:
            query["status"] = status_filter
        
        if start_date_filter:
            query["start_date"] = {"$gte": start_date_filter}
        if end_date_filter:
            query.setdefault("end_date", {}).update({"$lte": end_date_filter})

        records_to_export = list(leave_requests_collection.find(query).sort("request_date", -1))

        headers = ["Employee Name", "Employee ID", "Leave Type", "Start Date", "End Date",
                   "Reason", "Comments", "Request Date", "Status", "Admin Comment", "Reviewed By", "Reviewed At"]
        data = []

        def format_date_time_for_export(iso_string):
            if iso_string:
                try:
                    return datetime.datetime.fromisoformat(iso_string).strftime('%Y-%m-%d %H:%M:%S')
                except ValueError:
                    pass
            return '-'

        for r in records_to_export:
            data.append([
                r.get('full_name', '-'),
                r.get('emp_id', '-'),
                r.get('leave_type', '-'),
                r.get('start_date', '-'), # ISO date is fine here, Excel will handle
                r.get('end_date', '-'),   # ISO date is fine here, Excel will handle
                r.get('reason', '-'),
                r.get('comments', '-') or '-',
                format_date_time_for_export(r.get('request_date')),
                r.get('status', '-'),
                r.get('admin_comment', '-') or '-',
                r.get('reviewed_by', '-') or '-', # Ensure this is also correctly extracted
                format_date_time_for_export(r.get('reviewed_at'))
            ])

        return export_data(data, headers, "leave_requests", format_type)

    except Exception as e:
        app.logger.error(f"Error exporting leave requests: {str(e)}", exc_info=True)
        return redirect(url_for('admin_leave_management', error=f'Failed to export leave data: {str(e)}'))

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'faces'), exist_ok=True)
    os.makedirs(os.path.join(app.config['TEMP_UPLOAD_FOLDER']), exist_ok=True)
    os.makedirs(os.path.join(app.config['SHARED_LOADER_PATH'], 'images'), exist_ok=True)
    os.makedirs(os.path.join(app.config['SHARED_LOADER_PATH'], 'archive'), exist_ok=True)

    init_db()
    debug_mode = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1", "t")
    app.run(debug=debug_mode, host='0.0.0.0', port=5000)