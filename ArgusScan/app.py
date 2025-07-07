import re
from flask import Flask, Response, render_template, request, redirect, send_from_directory, url_for, session, jsonify
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
import base64
import face_recognition
import numpy as np
import time
import sqlite3
import requests
import secrets
import datetime
import json
import random
import string
import csv
import io
import pandas as pd
import smtplib
from email.message import EmailMessage 

app = Flask(__name__)
app.secret_key = 'your-secret-key-123'
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['DATABASE'] = 'database/face_recognition.db'



def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def init_db():
    with sqlite3.connect(app.config['DATABASE']) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                emp_id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                personal_email TEXT,
                image_path TEXT NOT NULL,
                face_encoding TEXT NOT NULL,
                password TEXT NOT NULL DEFAULT '',
                department TEXT DEFAULT 'Marketing',
                position TEXT DEFAULT 'Developer'
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                emp_id TEXT,
                date TEXT,
                punch_in TEXT,
                punch_out TEXT,
                latitude REAL,
                longitude REAL,
                address TEXT,
                punch_out_latitude REAL,
                punch_out_longitude REAL,
                punch_out_address TEXT,
                status TEXT DEFAULT 'Present',
                regularized_reason TEXT,
                regularized_comments TEXT,
                FOREIGN KEY (emp_id) REFERENCES users (emp_id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                emp_id TEXT PRIMARY KEY,
                token TEXT NOT NULL,
                expiry TEXT NOT NULL,
                FOREIGN KEY (emp_id) REFERENCES users (emp_id)
            )
        ''')
        cursor.execute('SELECT username FROM admins WHERE username = ?', ('admin',))
        if not cursor.fetchone():
            cursor.execute('INSERT INTO admins (username, password) VALUES (?, ?)',
                         ('admin', 'admin123'))
        conn.commit()

def get_db():
    return sqlite3.connect(app.config['DATABASE'])

def save_base64_image(data, filename):
    try:
        if 'base64,' in data:
            data = data.split('base64,')[1]
        img_data = base64.b64decode(data)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        with open(filepath, 'wb') as f:
            f.write(img_data)
        return filepath
    except Exception as e:
        print(f"Error saving image: {e}")
        return None

def reverse_geocode(lat, lon):
    try:
        if not lat or not lon:
            return "Location not recorded"
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            'lat': lat,
            'lon': lon,
            'format': 'json',
            'zoom': 18,
            'addressdetails': 1
        }
        headers = {
            'User-Agent': 'FaceRecognitionAttendanceSystem/1.0',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        address_parts = []
        address = data.get('address', {})
        if 'road' in address:
            address_parts.append(address['road'])
        if 'house_number' in address:
            address_parts.append(address['house_number'])
        if 'suburb' in address:
            address_parts.append(address['suburb'])
        if 'city_district' in address:
            address_parts.append(address['city_district'])
        if 'city' in address:
            address_parts.append(address['city'])
        if 'state' in address:
            address_parts.append(address['state'])
        if 'country' in address:
            address_parts.append(address['country'])
        if 'postcode' in address:
            address_parts.append(address['postcode'])
        if not address_parts:
            return f"Location at {lat:.6f}, {lon:.6f}"
        return ', '.join(filter(None, address_parts))
    except Exception as e:
        print(f"Geocoding error: {e}")
        return f"Location at {lat:.6f}, {lon:.6f}"


def update_db_schema():
    with sqlite3.connect(app.config['DATABASE']) as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'department' not in columns:
            try:
                cursor.execute('ALTER TABLE users ADD COLUMN department TEXT DEFAULT "Marketing"')
                print("Added department column to users table")
            except Exception as e:
                print(f"Error adding department column: {e}")

        if 'position' not in columns:
            try:
                cursor.execute('ALTER TABLE users ADD COLUMN position TEXT DEFAULT "Developer"')
                print("Added position column to users table")
            except Exception as e:
                print(f"Error adding position column: {e}")


        if 'password' not in columns:
            try:
                cursor.execute('ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT ""')
                print("Added password column to users table")
            except Exception as e:
                print(f"Error adding password column: {e}")
        
        if 'personal_email' not in columns:
            try:
                cursor.execute('ALTER TABLE users ADD COLUMN personal_email TEXT')
                print("Added personal_email column to users table")
            except Exception as e:
                print(f"Error adding personal_email column: {e}")

        

        conn.commit()

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/admin')
def admin_login():
    return render_template('admin.html')

@app.route('/service-worker.js')
def service_worker():
    return send_from_directory('static/js', 'service-worker.js', mimetype='application/javascript')

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

@app.route('/admin/auth', methods=['GET', 'POST'])
def admin_authenticate():
    if request.method == 'POST':
        username = request.form.get('adminid')
        password = request.form.get('adminpass')
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT password FROM admins WHERE username = ?', (username,))
                result = cursor.fetchone()
                if result and result[0] == password:
                    session['admin_logged_in'] = True
                    session['admin_username'] = username
                    return redirect(url_for('admin_dashboard'))
            return render_template('admin.html', error='Invalid credentials')
        except Exception as e:
            return render_template('admin.html', error=f'Authentication error: {str(e)}')
    return redirect(url_for('admin_login'))

@app.route('/employee_login')
def employee_login():
    return render_template('employee_login.html')

@app.route('/static/uploads/faces/<filename>')
def uploaded_file(filename):
    return send_from_directory(os.path.join(app.config['UPLOAD_FOLDER'], 'faces'), filename)

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('admin_login'))

@app.route('/employee_signup', methods=['GET', 'POST'])
def employee_signup():
    if request.method == 'POST':
        try:
            data = request.get_json()
            if not data:
                return jsonify({"success": False, "message": "Invalid request data"}), 400

            # Validate required fields
            required_fields = ['fullName', 'empId', 'email', 'password', 'capturedImage']
            if not all(field in data for field in required_fields):
                return jsonify({"success": False, "message": "All required fields are missing"}), 400

            full_name = data.get('fullName')
            emp_id = data.get('empId')
            email = data.get('email')
            personal_email = data.get('personalEmail')
            password = data.get('password')
            photo_data = data.get('capturedImage')

            # Validate email format
            if not email.endswith('@innovasolutions.com'):
                return jsonify({"success": False, "message": "Please use your @innovasolutions.com email address"}), 400

            if personal_email and not re.match(r'^[^@]+@[^@]+\.[^@]+$', personal_email):
                return jsonify({"success": False, "message": "Invalid personal email format"}), 400

            # Check for existing employee ID or email before processing image
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT emp_id FROM users WHERE emp_id = ?', (emp_id,))
                if cursor.fetchone():
                    return jsonify({"success": False, "message": "Employee ID already exists"}), 400

                cursor.execute('SELECT emp_id FROM users WHERE email = ?', (email,))
                if cursor.fetchone():
                    return jsonify({"success": False, "message": "Email already exists"}), 400

            # Process the image
            filename = f"{emp_id}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
            image_path = os.path.join('static', 'uploads', 'faces', filename)
            os.makedirs(os.path.dirname(image_path), exist_ok=True)

            try:
                # Handle both data URL and raw base64
                if 'base64,' in photo_data:
                    photo_data = photo_data.split('base64,')[1]
                img_bytes = base64.b64decode(photo_data)
                with open(image_path, "wb") as f:
                    f.write(img_bytes)
            except Exception as e:
                return jsonify({"success": False, "message": f"Error saving image: {str(e)}"}), 400

            # Process face recognition
            face_encoding = None
            try:
                image = face_recognition.load_image_file(image_path)
                encodings = face_recognition.face_encodings(image)
                
                if not encodings:
                    os.remove(image_path)
                    return jsonify({"success": False, "message": "No face detected in image"}), 400
                
                new_encoding = encodings[0]
                face_encoding = str(new_encoding.tolist())

                # Check for duplicate faces with more lenient matching
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute('SELECT emp_id, face_encoding FROM users WHERE face_encoding != "[]"')
                    existing_encodings = cursor.fetchall()
                    
                    for existing_emp_id, encoding_str in existing_encodings:
                        try:
                            existing_encoding = np.array(eval(encoding_str))
                            # Use a lower tolerance for matching (default is 0.6)
                            matches = face_recognition.compare_faces(
                                [existing_encoding], 
                                new_encoding, 
                                tolerance=0.5  # More strict matching
                            )
                            face_distance = face_recognition.face_distance([existing_encoding], new_encoding)[0]
                            
                            if matches[0] and face_distance < 0.5:  # More strict threshold
                                os.remove(image_path)
                                return jsonify({
                                    "success": False, 
                                    "message": f"This face is already registered with employee ID: {existing_emp_id}"
                                }), 400
                        except Exception as e:
                            print(f"Error processing encoding for employee {existing_emp_id}: {e}")
                            continue

            except Exception as e:
                print(f"Warning: Face recognition processing failed: {str(e)}")
                # Continue registration even if face recognition fails, but with empty encoding
                face_encoding = '[]'

            # Hash the password
            hashed_password = generate_password_hash(password)

            # Insert the new employee
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO users (emp_id, full_name, email, personal_email, 
                                     image_path, face_encoding, password, department, position)
                    VALUES (?, ?, ?, ?, ?, ?, ?, '', '')
                ''', (
                    emp_id,
                    full_name,
                    email,
                    personal_email,
                    image_path,
                    face_encoding if face_encoding else '[]',
                    hashed_password
                ))
                conn.commit()

            return jsonify({"success": True, "message": "Registration successful"}), 200

        except Exception as e:
            print(f"Error in employee_signup: {str(e)}")
            return jsonify({"success": False, "message": f"An error occurred: {str(e)}"}), 500

    return render_template('employee_signup.html')


@app.route('/employee')
def employee():
    if 'user' not in session:
        return redirect(url_for('employee_login'))
    try:
        emp_id = session['user']['emp_id']
        today = datetime.date.today().isoformat()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT punch_in, punch_out, status FROM attendance
                WHERE emp_id = ? AND date = ?
                ORDER BY punch_in
            ''', (emp_id, today))
            records = cursor.fetchall()
            cursor.execute('''SELECT emp_id, full_name, email, image_path, department, position
                           FROM users WHERE emp_id = ?''', (emp_id,))
            user_data = cursor.fetchone()
        
        attendance_records = []
        for record in records:
            punch_in = record[0] if record else None
            punch_out = record[1] if record else None
            status = record[2] if record else None
            if punch_in:
                punch_in = datetime.datetime.fromisoformat(punch_in).strftime('%H:%M:%S')
            if punch_out:
                punch_out = datetime.datetime.fromisoformat(punch_out).strftime('%H:%M:%S')
            attendance_records.append({
                'punch_in': punch_in,
                'punch_out': punch_out,
                'status': status if status else ('Active' if punch_in and not punch_out else 'Completed')
            })
        
        status = "Punched In" if any(rec['punch_in'] and not rec['punch_out'] for rec in attendance_records) else "Punched Out"
        
        # Construct proper image URL
        image_path = None
        if user_data and user_data[3]:
            image_path = url_for('static', filename=user_data[3].replace('static/', '')) if not user_data[3].startswith(('http://', 'https://')) else user_data[3]
        
        return render_template('employee.html',
                            username=session['user']['username'],
                            status=status,
                            attendance_records=attendance_records,
                            emp_id=emp_id,
                            user={
                                'emp_id': user_data[0],
                                'image_path': image_path,
                                'email': user_data[2],
                                'department': user_data[4] if user_data[4] else 'Not assigned',
                                'position': user_data[5] if user_data[5] else 'Not assigned'
                            })
    except Exception as e:
        app.logger.error(f"Error loading employee dashboard: {str(e)}")
        return render_template('employee.html',
                            error=str(e),
                            username=session.get('user', {}).get('username', ''),
                            status='Error',
                            attendance_records=[],
                            emp_id=session.get('user', {}).get('emp_id', ''),
                            user={'emp_id': '', 'image_path': None})

@app.route('/auto_signin', methods=['POST'])
def auto_signin():
    temp_path = None
    try:
        photo_data = request.json.get('capturedPhoto')
        action = request.json.get('action', 'punchin')

        if not photo_data:
            return jsonify({
                'success': False,
                'message': 'No image received. Please position your face in the frame.'
            }), 400

        temp_filename = f"temp_{datetime.datetime.now().strftime('%f')}.jpg"
        temp_path = save_base64_image(photo_data, temp_filename)

        if not temp_path:
            return jsonify({
                'success': False,
                'message': 'Image processing failed. Please try again.'
            }), 500

        temp_image = face_recognition.load_image_file(temp_path)
        temp_encodings = face_recognition.face_encodings(temp_image)

        if not temp_encodings:
            os.remove(temp_path)
            return jsonify({
                'success': False,
                'message': 'No face detected. Please ensure your face is clearly visible.'
            }), 400

        temp_encoding = temp_encodings[0]
        matched_user = None
        best_match_score = 0.5

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT emp_id, full_name, image_path, face_encoding FROM users')
            users = cursor.fetchall()

            for user in users:
                emp_id, full_name, image_path, face_encoding_str = user
                try:
                    stored_encoding = np.array(eval(face_encoding_str))
                    face_distance = face_recognition.face_distance([stored_encoding], temp_encoding)[0]
                    match_score = 1 - face_distance

                    if match_score > best_match_score:
                        best_match_score = match_score
                        matched_user = {
                            'emp_id': emp_id,
                            'full_name': full_name,
                            'image_path': image_path,
                            'match_score': match_score
                        }
                except Exception as e:
                    print(f"Error processing user {emp_id}: {str(e)}")
                    continue

        os.remove(temp_path)

        if not matched_user:
            return jsonify({
                'success': False,
                'message': 'User not recognized. Please try again or contact admin.'
            }), 404

        if best_match_score < 0.6:
            return jsonify({
                'success': False,
                'message': f'Recognition confidence too low ({int(best_match_score*100)}%). Please try again.'
            }), 400

        emp_id = matched_user['emp_id']
        today = datetime.date.today().isoformat()
        now = datetime.datetime.now().isoformat()
        latitude = request.json.get('latitude')
        longitude = request.json.get('longitude')
        address = reverse_geocode(latitude, longitude) if latitude and longitude else 'Location not recorded'

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, punch_in, punch_out FROM attendance
                WHERE emp_id = ? AND date = ?
                ORDER BY punch_in DESC LIMIT 1
            ''', (emp_id, today))

            existing_record = cursor.fetchone()
            status = ""

            if existing_record:
                record_id, punch_in, punch_out = existing_record

                if action == 'punchin':
                    if not punch_out:
                        cursor.execute('''
                            SELECT punch_in, address FROM attendance
                            WHERE emp_id = ? AND date = ? AND punch_out IS NULL
                            ORDER BY punch_in DESC LIMIT 1
                        ''', (emp_id, today))
                        last_punch_in = cursor.fetchone()
                        
                        if last_punch_in:
                            punch_in_time, punch_in_location = last_punch_in
                            punch_in_time = datetime.datetime.fromisoformat(punch_in_time).strftime('%H:%M:%S')
                            return jsonify({
                                'success': False,
                                'message': f'Already punched in at {punch_in_time} ({punch_in_location}). Punch out first.'
                            }), 400
                        else:
                            return jsonify({
                                'success': False,
                                'message': 'You are already punched in. Please punch out first.'
                            }), 400
                    else:
                        cursor.execute('''
                            INSERT INTO attendance (
                                emp_id, date, punch_in, punch_out, 
                                latitude, longitude, address,
                                punch_out_latitude, punch_out_longitude, punch_out_address
                            )
                            VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL)
                        ''', (emp_id, today, now, latitude, longitude, address))
                        status = "Punched In"
                else:
                    if not punch_out:
                        cursor.execute('''
                            UPDATE attendance SET 
                                punch_out = ?, 
                                punch_out_latitude = ?, 
                                punch_out_longitude = ?,
                                punch_out_address = ?
                            WHERE id = ?
                        ''', (now, latitude, longitude, address, record_id))
                        status = "Punched Out"
                    else:
                        return jsonify({
                            'success': False,
                            'message': 'No active punch in found. Please punch in first.'
                        }), 400
            else:
                if action == 'punchin':
                    cursor.execute('''
                        INSERT INTO attendance (
                            emp_id, date, punch_in, punch_out, 
                            latitude, longitude, address,
                            punch_out_latitude, punch_out_longitude, punch_out_address
                        )
                        VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL)
                    ''', (emp_id, today, now, latitude, longitude, address))
                    status = "Punched In"
                else:
                    return jsonify({
                        'success': False,
                        'message': 'No punch in record found. Please punch in first.'
                    }), 400

            conn.commit()

            return jsonify({
                'success': True,
                'full_name': matched_user['full_name'],
                'emp_id': emp_id,
                'status': status,
                'image_path': matched_user['image_path'],
                'confidence': round(best_match_score, 2),
                'action': action,
                'location': address,
                'timestamp': now
            }), 200

    except Exception as e:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        app.logger.error(f"Auto sign-in error: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"System error: {str(e)}"
        }), 500

@app.route('/employee_login_auth', methods=['POST'])
def employee_login_auth():
    try:
        data = request.get_json()
        emp_id = data.get('empId')
        password = data.get('password')

        if not emp_id or not password:
            return jsonify({'success': False, 'message': 'Employee ID and password are required'}), 400

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT emp_id, full_name, password FROM users WHERE emp_id = ?', (emp_id,))
            user = cursor.fetchone()

            if user:
                stored_emp_id, full_name, stored_password = user
                if check_password_hash(stored_password, password):
                    cursor.execute('''SELECT image_path, department, position
                                   FROM users WHERE emp_id = ?''', (stored_emp_id,))
                    profile_info = cursor.fetchone()
                    image_path, department, position = profile_info if profile_info else (None, 'Marketing', 'Developer')

                    session['user'] = {
                        'username': full_name,
                        'emp_id': stored_emp_id,
                        'status': 'Logged In',
                        'image_path': image_path,
                        'department': department,
                        'position': position
                    }
                    return jsonify({'success': True, 'message': 'Login successful'})
                else:
                    return jsonify({'success': False, 'message': 'Invalid password'})
            else:
                return jsonify({'success': False, 'message': 'Invalid employee ID'})
    except Exception as e:
        app.logger.error(f"Login error: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred during login'}), 500


@app.route('/attendance')
def attendance():
    if 'user' not in session:
        return redirect(url_for('home'))
    try:
        emp_id = session['user']['emp_id']
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT date,
                       MIN(punch_in) as first_punch_in,
                       MAX(punch_out) as last_punch_out,
                       GROUP_CONCAT(status) as statuses,
                       GROUP_CONCAT(address) as addresses,
                       GROUP_CONCAT(latitude) as latitudes,
                       GROUP_CONCAT(longitude) as longitudes
                FROM attendance
                WHERE emp_id = ?
                GROUP BY date
                ORDER BY date DESC
            ''', (emp_id,))
            records = cursor.fetchall()
        attendance_data = []
        for record in records:
            date, first_punch_in, last_punch_out, statuses_str, addresses_str, latitudes_str, longitudes_str = record
            current_status = 'Absent'
            if statuses_str:
                all_statuses = statuses_str.split(',')
                if 'Regularized' in all_statuses:
                    current_status = 'Regularized'
                elif first_punch_in and last_punch_out:
                    current_status = 'Present'
                elif first_punch_in:
                    current_status = 'Active'
            punch_in_time = datetime.datetime.fromisoformat(first_punch_in).strftime('%H:%M') if first_punch_in else '-'
            punch_out_time = datetime.datetime.fromisoformat(last_punch_out).strftime('%H:%M') if last_punch_out else '-'
            work_hours = '-'
            if first_punch_in and last_punch_out:
                try:
                    delta = datetime.datetime.fromisoformat(last_punch_out) - datetime.datetime.fromisoformat(first_punch_in)
                    hours, remainder = divmod(delta.seconds, 3600)
                    minutes = remainder // 60
                    work_hours = f"{hours:02d}:{minutes:02d}"
                except ValueError:
                    work_hours = '-'
            address_for_display = 'Location not recorded'
            if addresses_str:
                last_address = addresses_str.split(',')[-1]
                if last_address and last_address != "Location not recorded":
                    address_for_display = last_address
                elif latitudes_str and longitudes_str:
                    try:
                        last_lat = float(latitudes_str.split(',')[-1])
                        last_lon = float(longitudes_str.split(',')[-1])
                        address_for_display = reverse_geocode(last_lat, last_lon)
                    except ValueError:
                        pass
            attendance_data.append({
                'date': datetime.datetime.fromisoformat(date).strftime('%d %b %Y'),
                'shift_in': '09:00',
                'shift_out': '17:00',
                'actual_in': punch_in_time,
                'actual_out': punch_out_time,
                'work_hours': work_hours,
                'status': current_status,
                'address': address_for_display
            })
        return render_template('attendance.html',
                            attendance_records=attendance_data,
                            user=session['user'])
    except Exception as e:
        app.logger.error(f"Error loading attendance records: {str(e)}")
        if 'user' in session:
            return render_template('attendance.html',
                                error=str(e),
                                user=session['user'],
                                attendance_records=[])
        else:
            return redirect(url_for('home'))

@app.route('/regularize_attendance', methods=['POST'])
def regularize_attendance():
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    try:
        data = request.get_json()
        if not data or 'records' not in data:
            return jsonify({'success': False, 'message': 'Invalid data format'}), 400

        emp_id = session['user']['emp_id']
        updated_records = []

        with get_db() as conn:
            cursor = conn.cursor()

            for record in data['records']:
                date_str = record['date']
                try:
                    date_obj = datetime.datetime.strptime(date_str, '%d %b %Y')
                    iso_date = date_obj.date().isoformat()
                except ValueError as e:
                    return jsonify({'success': False, 'message': f'Invalid date format: {date_str}. Expected format: "DD Mon YYYY"'}), 400

                modified_in = f"{iso_date}T{record['modified_in']}:00" if record['modified_in'] else None
                modified_out = f"{iso_date}T{record['modified_out']}:00" if record['modified_out'] else None
                reason = record.get('reason', '')
                comments = record.get('comments', '')

                # Get the original record
                cursor.execute('''
                    SELECT id, punch_in, punch_out, latitude, longitude, address
                    FROM attendance
                    WHERE emp_id = ? AND date(date) = date(?) 
                    ORDER BY punch_in LIMIT 1
                ''', (emp_id, iso_date))
                original_record = cursor.fetchone()

                original_punch_in = None
                original_punch_out = None
                original_latitude = None
                original_longitude = None
                original_address = None

                if original_record:
                    record_id, original_punch_in, original_punch_out, original_latitude, original_longitude, original_address = original_record
                    
                    # Mark the original record as historical
                    cursor.execute('''
                        UPDATE attendance SET status = 'Historical'
                        WHERE id = ?
                    ''', (record_id,))

                # Insert the regularized record with modified times
                cursor.execute('''
                    INSERT INTO attendance (
                        emp_id, date, punch_in, punch_out,
                        latitude, longitude, address,
                        status, regularized_reason, regularized_comments
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Regularized', ?, ?)
                ''', (
                    emp_id,
                    iso_date,
                    modified_in if modified_in else original_punch_in,
                    modified_out if modified_out else original_punch_out,
                    original_latitude,
                    original_longitude,
                    original_address,
                    reason,
                    comments
                ))

                # Get the newly inserted record with all details
                cursor.execute('''
                    SELECT date, punch_in, punch_out, status
                    FROM attendance
                    WHERE id = ?
                ''', (cursor.lastrowid,))
                inserted_record = cursor.fetchone()

                if inserted_record:
                    updated_records.append({
                        'date': datetime.datetime.fromisoformat(inserted_record[0]).strftime('%d %b %Y'),
                        'actual_in': datetime.datetime.fromisoformat(inserted_record[1]).strftime('%H:%M') if inserted_record[1] else '-',
                        'actual_out': datetime.datetime.fromisoformat(inserted_record[2]).strftime('%H:%M') if inserted_record[2] else '-',
                        'status': inserted_record[3],
                        'modified_in': datetime.datetime.fromisoformat(inserted_record[1]).strftime('%H:%M') if inserted_record[1] else '-',
                        'modified_out': datetime.datetime.fromisoformat(inserted_record[2]).strftime('%H:%M') if inserted_record[2] else '-'
                    })
            conn.commit()

        return jsonify({
            'success': True,
            'message': 'Attendance regularized successfully',
            'updated_records': updated_records
        })

    except Exception as e:
        app.logger.error(f"Error regularizing attendance: {str(e)}")
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

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM users')
            total_employees = cursor.fetchone()[0]

            today = datetime.date.today().isoformat()
            cursor.execute('''
                SELECT COUNT(DISTINCT emp_id) FROM attendance
                WHERE date = ? AND (punch_in IS NOT NULL)
            ''', (today,))
            present_count = cursor.fetchone()[0]

            late_count = 0
            cursor.execute('''
                SELECT emp_id, MIN(punch_in) FROM attendance
                WHERE date = ? AND punch_in IS NOT NULL
                GROUP BY emp_id
            ''', (today,))
            today_punch_ins = cursor.fetchall()

            for emp, first_punch_in_str in today_punch_ins:
                if first_punch_in_str:
                    first_punch_in_time = datetime.datetime.fromisoformat(first_punch_in_str).time()
                    late_threshold = datetime.time(9, 0, 0)
                    if first_punch_in_time > late_threshold:
                        late_count += 1

            cursor.execute("SELECT COUNT(*) FROM attendance WHERE status = 'Regularized'")
            pending_requests = cursor.fetchone()[0]

            base_query = '''
                SELECT 
                    u.full_name, 
                    a.emp_id, 
                    a.date, 
                    a.punch_in, 
                    a.punch_out,
                    CASE WHEN a.latitude IS NULL THEN '-' ELSE a.latitude END as punch_in_latitude,
                    CASE WHEN a.longitude IS NULL THEN '-' ELSE a.longitude END as punch_in_longitude,
                    CASE 
                        WHEN a.address IS NOT NULL AND a.address != '' THEN a.address
                        WHEN a.latitude IS NOT NULL AND a.longitude IS NOT NULL 
                            THEN 'Location at ' || ROUND(a.latitude, 6) || ', ' || ROUND(a.longitude, 6)
                        ELSE 'Location not recorded'
                    END as punch_in_address,
                    CASE WHEN a.punch_out_latitude IS NULL THEN '-' ELSE a.punch_out_latitude END as punch_out_latitude,
                    CASE WHEN a.punch_out_longitude IS NULL THEN '-' ELSE a.punch_out_longitude END as punch_out_longitude,
                    CASE 
                        WHEN a.punch_out_address IS NOT NULL AND a.punch_out_address != '' THEN a.punch_out_address
                        WHEN a.punch_out_latitude IS NOT NULL AND a.punch_out_longitude IS NOT NULL 
                            THEN 'Location at ' || ROUND(a.punch_out_latitude, 6) || ', ' || ROUND(a.punch_out_longitude, 6)
                        ELSE 'Location not recorded'
                    END as punch_out_address,
                    a.status
                FROM attendance a
                JOIN users u ON a.emp_id = u.emp_id
                WHERE 1=1
            '''
            params = []

            if start_date:
                base_query += " AND date(a.date) >= ?"
                params.append(start_date)
            if end_date:
                base_query += " AND date(a.date) <= ?"
                params.append(end_date)
            if emp_id_filter:
                base_query += " AND a.emp_id = ?"
                params.append(emp_id_filter)
            if status_filter:
                base_query += " AND a.status = ?"
                params.append(status_filter)

            count_query = "SELECT COUNT(*) FROM (" + base_query + ")"
            cursor.execute(count_query, params)
            total_records = cursor.fetchone()[0]
            total_pages = (total_records + per_page - 1) // per_page
            offset = (page - 1) * per_page

            if sort == 'intime_asc':
                base_query += " ORDER BY a.punch_in ASC"
            elif sort == 'intime_desc':
                base_query += " ORDER BY a.punch_in DESC"
            elif sort == 'outtime_asc':
                base_query += " ORDER BY a.punch_out ASC"
            elif sort == 'outtime_desc':
                base_query += " ORDER BY a.punch_out DESC"
            elif sort == 'date_asc':
                base_query += " ORDER BY a.date ASC"
            elif sort == 'date_desc':
                base_query += " ORDER BY a.date DESC"
            else:
                base_query += " ORDER BY a.date DESC"

            base_query += " LIMIT ? OFFSET ?"
            params.extend([per_page, offset])

            cursor.execute(base_query, params)
            records = cursor.fetchall()

        attendance_records = []
        for record in records:
            (full_name, emp_id, date, punch_in, punch_out, 
             punch_in_lat, punch_in_lng, punch_in_address,
             punch_out_lat, punch_out_lng, punch_out_address,
             status) = record

            formatted_punch_in = datetime.datetime.fromisoformat(punch_in).strftime('%H:%M:%S') if punch_in else '-'
            formatted_punch_out = datetime.datetime.fromisoformat(punch_out).strftime('%H:%M:%S') if punch_out else '-'

            punch_in_lat = None if punch_in_lat == '-' else float(punch_in_lat)
            punch_in_lng = None if punch_in_lng == '-' else float(punch_in_lng)
            punch_out_lat = None if punch_out_lat == '-' else float(punch_out_lat)
            punch_out_lng = None if punch_out_lng == '-' else float(punch_out_lng)

            if punch_in_address and punch_in_address.startswith('Location at') and punch_in_lat and punch_in_lng:
                try:
                    punch_in_address = reverse_geocode(punch_in_lat, punch_in_lng)
                except:
                    pass

            if punch_out_address and punch_out_address.startswith('Location at') and punch_out_lat and punch_out_lng:
                try:
                    punch_out_address = reverse_geocode(punch_out_lat, punch_out_lng)
                except:
                    pass

            attendance_records.append({
                'full_name': full_name,
                'emp_id': emp_id,
                'date': datetime.datetime.fromisoformat(date).strftime('%Y-%m-%d') if date else '-',
                'punch_in': formatted_punch_in,
                'punch_out': formatted_punch_out,
                'punch_in_latitude': punch_in_lat,
                'punch_in_longitude': punch_in_lng,
                'punch_in_address': punch_in_address if punch_in_address else 'Location not recorded',
                'punch_out_latitude': punch_out_lat,
                'punch_out_longitude': punch_out_lng,
                'punch_out_address': punch_out_address if punch_out_address else 'Location not recorded',
                'status': status if status else 'Present'
            })

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT DISTINCT status FROM attendance WHERE status IS NOT NULL')
            status_options = [row[0] for row in cursor.fetchall()]

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
                            pending_requests=pending_requests,
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
                            pending_requests=0,
                            total_records=0,
                            total_pages=0,
                            page=1)
    

@app.route('/admin/regularization')
@admin_required
def admin_regularization():
    conn = None
    try:
        employee_filter = request.args.get('employee', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        page = int(request.args.get('page', 1))
        per_page = 10

        conn = get_db()
        cursor = conn.cursor()
        
        base_query = '''
            SELECT 
                a.id,
                u.full_name,
                u.emp_id,
                a.date,
                CASE 
                    WHEN h.punch_in IS NOT NULL THEN h.punch_in
                    ELSE (
                        SELECT punch_in FROM attendance 
                        WHERE emp_id = a.emp_id AND date = a.date 
                        AND status != 'Historical'
                        ORDER BY punch_in LIMIT 1
                    )
                END as original_punch_in,
                CASE 
                    WHEN h.punch_out IS NOT NULL THEN h.punch_out
                    ELSE (
                        SELECT punch_out FROM attendance 
                        WHERE emp_id = a.emp_id AND date = a.date 
                        AND status != 'Historical'
                        ORDER BY punch_out DESC LIMIT 1
                    )
                END as original_punch_out,
                a.punch_in as modified_punch_in,
                a.punch_out as modified_punch_out,
                a.regularized_reason,
                a.status,
                a.regularized_comments
            FROM attendance a
            JOIN users u ON a.emp_id = u.emp_id
            LEFT JOIN attendance h ON h.emp_id = a.emp_id 
                AND h.date = a.date 
                AND h.status = 'Historical'
            WHERE a.status = 'Regularized'
        '''
        params = []

        if employee_filter:
            base_query += " AND (u.emp_id = ? OR u.full_name LIKE ?)"
            params.extend([employee_filter, f'%{employee_filter}%'])
        if start_date:
            base_query += " AND date(a.date) >= ?"
            params.append(start_date)
        if end_date:
            base_query += " AND date(a.date) <= ?"
            params.append(end_date)

        count_query = "SELECT COUNT(*) FROM (" + base_query + ")"
        cursor.execute(count_query, params)
        total_records = cursor.fetchone()[0]
        total_pages = (total_records + per_page - 1) // per_page
        offset = (page - 1) * per_page

        base_query += " ORDER BY a.date DESC LIMIT ? OFFSET ?"
        params.extend([per_page, offset])

        cursor.execute(base_query, params)
        records = cursor.fetchall()

        regularization_records = []
        for record in records:
            (req_id, full_name, emp_id, date, original_punch_in, original_punch_out,
             modified_punch_in, modified_punch_out, reason, status, comments) = record

            def format_time(time_str):
                if not time_str:
                    return '-'
                try:
                    return datetime.datetime.fromisoformat(time_str).strftime('%H:%M')
                except:
                    return time_str

            regularization_records.append({
                'id': req_id,
                'full_name': full_name,
                'emp_id': emp_id,
                'date': datetime.datetime.fromisoformat(date).strftime('%Y-%m-%d') if date else '-',
                'original_punch_in': format_time(original_punch_in),
                'original_punch_out': format_time(original_punch_out),
                'modified_punch_in': format_time(modified_punch_in),
                'modified_punch_out': format_time(modified_punch_out),
                'reason': reason,
                'status': status,
                'comments': comments
            })

        return render_template('admin_regularization.html',
                            regularization_records=regularization_records,
                            employee_filter=employee_filter,
                            start_date=start_date,
                            end_date=end_date,
                            total_records=total_records,
                            total_pages=total_pages,
                            page=page,
                            per_page=per_page)

    except Exception as e:
        return render_template('admin_regularization.html',
                            error=f'An error occurred: {str(e)}',
                            regularization_records=[],
                            total_records=0,
                            total_pages=0,
                            page=1)
 
@app.route('/update_password', methods=['POST'])
def update_password():
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    try:
        data = request.get_json()
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')

        if not all([current_password, new_password, confirm_password]):
            return jsonify({'success': False, 'message': 'All fields are required'}), 400

        if new_password != confirm_password:
            return jsonify({'success': False, 'message': 'New passwords do not match'}), 400

        emp_id = session['user']['emp_id']

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT password FROM users WHERE emp_id = ?', (emp_id,))
            result = cursor.fetchone()

            if not result or not check_password_hash(result[0], current_password):
                return jsonify({'success': False, 'message': 'Current password is incorrect'}), 400

            hashed_password = generate_password_hash(new_password)
            cursor.execute('UPDATE users SET password = ? WHERE emp_id = ?', (hashed_password, emp_id))
            conn.commit()

        return jsonify({'success': True, 'message': 'Password updated successfully'})

    except Exception as e:
        app.logger.error(f"Error updating password: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred while updating password'}), 500

    
@app.route('/admin/export_employees')
@admin_required
def export_employees():
    try:
        search = request.args.get('search', '')
        department = request.args.get('department', '')
        format_type = request.args.get('format', 'csv')

        with get_db() as conn:
            cursor = conn.cursor()
            
            query = '''
                SELECT emp_id, full_name, email, personal_email, 
                       department, position 
                FROM users 
                WHERE 1=1
            '''
            params = []
            
            if search:
                query += " AND (full_name LIKE ? OR emp_id LIKE ? OR email LIKE ? OR personal_email LIKE ?)"
                search_term = f'%{search}%'
                params.extend([search_term, search_term, search_term, search_term])
            
            if department:
                query += " AND department = ?"
                params.append(department)
                
            cursor.execute(query, params)
            employees = cursor.fetchall()
            
        data = []
        headers = ["Employee ID", "Full Name", "Email", "Personal Email", "Department", "Position"]
        
        for emp in employees:
            data.append([
                emp[0],  # emp_id
                emp[1],  # full_name
                emp[2],  # email
                emp[3] or '-',  # personal_email
                emp[4] or '-',  # department
                emp[5] or '-'   # position
            ])

        if format_type == 'csv':
            si = io.StringIO()
            cw = csv.writer(si)
            cw.writerow(headers)
            cw.writerows(data)
            output = si.getvalue()
            mimetype = "text/csv"
            filename = "employees.csv"
        elif format_type == 'xlsx':
            output = io.BytesIO()
            df = pd.DataFrame(data, columns=headers)
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                df.to_excel(writer, index=False, sheet_name='Employees')
                worksheet = writer.sheets['Employees']
                for idx, col in enumerate(df.columns):
                    max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
                    worksheet.set_column(idx, idx, max_len)
            output.seek(0)
            mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = "employees.xlsx"
        else:
            return redirect(url_for('admin_emp_manage', error="Invalid export format"))

        return Response(
            output,
            mimetype=mimetype,
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        app.logger.error(f"Error exporting employees: {str(e)}")
        return redirect(url_for('admin_emp_manage', error=str(e)))

# In app.py, update the export_attendance route
@app.route('/admin/export_attendance')
@admin_required
def export_attendance():
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        emp_id_filter = request.args.get('emp_id')
        status_filter = request.args.get('status')
        format_type = request.args.get('format', 'csv').lower()  # Ensure lowercase

        with get_db() as conn:
            cursor = conn.cursor()

            base_query = '''
                SELECT u.full_name, a.emp_id, a.date, a.punch_in, a.punch_out,
                       a.address as punch_in_address,
                       a.punch_out_address,
                       a.status
                FROM attendance a
                JOIN users u ON a.emp_id = u.emp_id
                WHERE 1=1
            '''
            params = []

            if start_date:
                base_query += " AND date(a.date) >= ?"
                params.append(start_date)
            if end_date:
                base_query += " AND date(a.date) <= ?"
                params.append(end_date)
            if emp_id_filter:
                base_query += " AND a.emp_id = ?"
                params.append(emp_id_filter)
            if status_filter:
                base_query += " AND a.status = ?"
                params.append(status_filter)

            base_query += " ORDER BY a.date DESC"
            cursor.execute(base_query, params)
            records = cursor.fetchall()

        data = []
        headers = ["Employee Name", "Employee ID", "Date", "Punch In", 
                  "Punch Out", "Punch In Location", "Punch Out Location", "Status"]
        
        for record in records:
            (full_name, emp_id, date, punch_in, punch_out, 
             punch_in_address, punch_out_address, status) = record
            
            data.append([
                full_name,
                emp_id,
                datetime.datetime.fromisoformat(date).strftime('%Y-%m-%d') if date else '-',
                datetime.datetime.fromisoformat(punch_in).strftime('%H:%M:%S') if punch_in else '-',
                datetime.datetime.fromisoformat(punch_out).strftime('%H:%M:%S') if punch_out else '-',
                punch_in_address or '-',
                punch_out_address or '-',
                status or '-'
            ])

        if format_type == 'csv':
            si = io.StringIO()
            cw = csv.writer(si)
            cw.writerow(headers)
            cw.writerows(data)
            output = si.getvalue()
            mimetype = "text/csv"
            filename = "attendance_records.csv"
        elif format_type in ['xlsx', 'excel']:  # Accept both 'xlsx' and 'excel'
            output = io.BytesIO()
            df = pd.DataFrame(data, columns=headers)
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                df.to_excel(writer, index=False, sheet_name='Attendance Records')
                worksheet = writer.sheets['Attendance Records']
                for idx, col in enumerate(df.columns):
                    max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
                    worksheet.set_column(idx, idx, max_len)
            output.seek(0)
            mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = "attendance_records.xlsx"
        else:
            return redirect(url_for('admin_dashboard', error="Invalid export format"))

        return Response(
            output,
            mimetype=mimetype,
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        app.logger.error(f"Error exporting attendance: {str(e)}")
        return redirect(url_for('admin_dashboard', error=str(e)))

@app.route('/admin/export_regularization')
@admin_required
def export_regularization():
    try:
        employee_filter = request.args.get('employee', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        format_type = request.args.get('format', 'csv').lower()

        with get_db() as conn:
            cursor = conn.cursor()

            base_query = '''
                SELECT 
                    u.full_name,
                    u.emp_id,
                    a.date,
                    h.punch_in as original_punch_in,
                    h.punch_out as original_punch_out,
                    a.punch_in as modified_punch_in,
                    a.punch_out as modified_punch_out,
                    a.regularized_reason,
                    a.status,
                    a.regularized_comments
                FROM attendance a
                JOIN users u ON a.emp_id = u.emp_id
                LEFT JOIN attendance h ON h.emp_id = a.emp_id 
                    AND h.date = a.date 
                    AND h.status = 'Historical'
                WHERE a.status = 'Regularized'
            '''
            params = []

            if employee_filter:
                base_query += " AND (u.emp_id = ? OR u.full_name LIKE ?)"
                params.extend([employee_filter, f'%{employee_filter}%'])
            if start_date:
                base_query += " AND date(a.date) >= ?"
                params.append(start_date)
            if end_date:
                base_query += " AND date(a.date) <= ?"
                params.append(end_date)

            base_query += " ORDER BY a.date DESC"
            cursor.execute(base_query, params)
            records = cursor.fetchall()

        data = []
        headers = ["Employee Name", "Employee ID", "Date", 
                  "Original Punch In", "Original Punch Out",
                  "Modified Punch In", "Modified Punch Out",
                  "Reason", "Status", "Comments"]
        
        for record in records:
            (full_name, emp_id, date, original_punch_in, original_punch_out,
             modified_punch_in, modified_punch_out, reason, status, comments) = record
            
            def format_time(time_str):
                if not time_str:
                    return '-'
                try:
                    return datetime.datetime.fromisoformat(time_str).strftime('%H:%M:%S')
                except:
                    return time_str

            data.append([
                full_name,
                emp_id,
                datetime.datetime.fromisoformat(date).strftime('%Y-%m-%d') if date else '-',
                format_time(original_punch_in),
                format_time(original_punch_out),
                format_time(modified_punch_in),
                format_time(modified_punch_out),
                reason or '-',
                status or '-',
                comments or '-'
            ])

        if format_type == 'csv':
            si = io.StringIO()
            cw = csv.writer(si)
            cw.writerow(headers)
            cw.writerows(data)
            output = si.getvalue()
            mimetype = "text/csv"
            filename = "regularization_records.csv"
        elif format_type == 'xlsx':
            output = io.BytesIO()
            df = pd.DataFrame(data, columns=headers)
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                df.to_excel(writer, index=False, sheet_name='Regularization Records')
                worksheet = writer.sheets['Regularization Records']
                for idx, col in enumerate(df.columns):
                    max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
                    worksheet.set_column(idx, idx, max_len)
            output.seek(0)
            mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = "regularization_records.xlsx"
        else:
            return redirect(url_for('admin_regularization', error="Invalid export format"))

        return Response(
            output,
            mimetype=mimetype,
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        app.logger.error(f"Error exporting regularization records: {str(e)}")
        return redirect(url_for('admin_regularization', error=str(e)))

@app.route('/forgot_password', methods=['POST'])
def forgot_password():
    try:
        data = request.get_json()
        emp_id = data.get('empId')
        personal_email = data.get('personalEmail')

        if not emp_id or not personal_email:
            return jsonify({'success': False, 'message': 'Employee ID and personal email are required'}), 400

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT emp_id, personal_email FROM users WHERE emp_id = ?', (emp_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({'success': False, 'message': 'Employee ID not found'}), 404
            
            stored_emp_id, stored_personal_email = user
            if personal_email != stored_personal_email:
                return jsonify({'success': False, 'message': 'Personal email does not match our records'}), 400

            # Generate OTP
            otp = ''.join([str(random.randint(0, 9)) for _ in range(6)])
            
            # Store OTP in database with expiry (5 minutes)
            expiry = (datetime.datetime.now() + datetime.timedelta(minutes=5)).isoformat()
            cursor.execute('''
                INSERT OR REPLACE INTO password_reset_tokens (emp_id, token, expiry)
                VALUES (?, ?, ?)
            ''', (emp_id, otp, expiry))
            conn.commit()

            # Send OTP via email
            try:
                msg = EmailMessage()
                msg['Subject'] = "Password Reset OTP"
                msg['From'] = 'krishgolchha46@gmail.com'
                msg['To'] = personal_email
                msg.set_content(f"Your OTP for password reset is: {otp}")

                server = smtplib.SMTP('smtp.gmail.com', 587)
                server.starttls()
                server.login('krishgolchha46@gmail.com', 'eqhd mdib orvk jkbt')
                server.send_message(msg)
                server.quit()

                return jsonify({'success': True, 'message': 'OTP sent to your email'})
            except Exception as e:
                app.logger.error(f"Error sending email: {str(e)}")
                return jsonify({'success': False, 'message': 'Failed to send OTP'}), 500

    except Exception as e:
        app.logger.error(f"Error in forgot_password: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred'}), 500

@app.route('/verify_reset_code', methods=['POST'])
def verify_reset_code():
    try:
        data = request.get_json()
        emp_id = data.get('empId')
        code = data.get('code')

        if not emp_id or not code:
            return jsonify({'success': False, 'message': 'Employee ID and OTP are required'}), 400

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT token, expiry FROM password_reset_tokens 
                WHERE emp_id = ? AND expiry > ?
            ''', (emp_id, datetime.datetime.now().isoformat()))
            token_data = cursor.fetchone()

            if not token_data:
                return jsonify({'success': False, 'message': 'Invalid or expired OTP'}), 400
            
            stored_token, expiry = token_data
            if code == stored_token:
                return jsonify({'success': True, 'message': 'OTP verified'})
            else:
                return jsonify({'success': False, 'message': 'Invalid OTP'}), 400

    except Exception as e:
        app.logger.error(f"Error in verify_reset_code: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred'}), 500

@app.route('/reset_password', methods=['POST'])
def reset_password():
    try:
        data = request.get_json()
        emp_id = data.get('empId')
        new_password = data.get('newPassword')

        if not emp_id or not new_password:
            return jsonify({'success': False, 'message': 'Employee ID and new password are required'}), 400

        with get_db() as conn:
            cursor = conn.cursor()
            # Verify the user exists
            cursor.execute('SELECT emp_id FROM users WHERE emp_id = ?', (emp_id,))
            if not cursor.fetchone():
                return jsonify({'success': False, 'message': 'Employee ID not found'}), 404

            # Update password
            hashed_password = generate_password_hash(new_password)
            cursor.execute('UPDATE users SET password = ? WHERE emp_id = ?', (hashed_password, emp_id))
            
            # Delete the used OTP
            cursor.execute('DELETE FROM password_reset_tokens WHERE emp_id = ?', (emp_id,))
            
            conn.commit()

            return jsonify({'success': True, 'message': 'Password reset successfully'})

    except Exception as e:
        app.logger.error(f"Error in reset_password: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred'}), 500

@app.route('/admin/employees')
def admin_emp_manage():
    return render_template('admin_emp_manage.html')
    
@app.route('/admin/api/employees', methods=['GET', 'POST'])
@admin_required
def admin_api_employees():
    if request.method == 'GET':
        search = request.args.get('search', '')
        department = request.args.get('department', '')
        
        conn = get_db()
        cursor = conn.cursor()
        
        query = '''
            SELECT emp_id, full_name, email, personal_email, 
                   image_path, department, position 
            FROM users 
            WHERE 1=1
        '''
        params = []
        
        if search:
            query += " AND (full_name LIKE ? OR emp_id LIKE ? OR email LIKE ? OR personal_email LIKE ?)"
            search_term = f'%{search}%'
            params.extend([search_term, search_term, search_term, search_term])
        
        if department:
            query += " AND department = ?"
            params.append(department)
            
        cursor.execute(query, params)
        employees = cursor.fetchall()
        
        result = []
        for emp in employees:
            result.append({
                'emp_id': emp[0],
                'full_name': emp[1],
                'email': emp[2],
                'personal_email': emp[3],
                'image_path': emp[4],
                'department': emp[5],
                'position': emp[6]
            })
            
        return jsonify(result)
    
    elif request.method == 'POST':
        data = request.get_json()
        
        required_fields = ['fullName', 'employeeId', 'email', 'department', 'position', 'password']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
            
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # Check if employee ID or email already exists
            cursor.execute('SELECT emp_id FROM users WHERE emp_id = ? OR email = ?', 
                         (data['employeeId'], data['email']))
            if cursor.fetchone():
                return jsonify({'error': 'Employee ID or email already exists'}), 400
                
            # Process photo if provided
            image_path = 'https://via.placeholder.com/40'
            face_encoding = '[]'

            if 'photoData' in data and data['photoData']:
                try:
                    filename = f"{data['employeeId']}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
                    image_path = os.path.join('static', 'uploads', 'faces', filename)
                    os.makedirs(os.path.dirname(image_path), exist_ok=True)

                    # Save the image
                    img_data = base64.b64decode(data['photoData'])
                    with open(image_path, "wb") as f:
                        f.write(img_data)

                    # Process for face recognition
                    try:
                        image = face_recognition.load_image_file(image_path)
                        encodings = face_recognition.face_encodings(image)

                        if not encodings:
                            os.remove(image_path)
                            return jsonify({'error': 'No face detected in the photo. Please upload a clear frontal face photo.'}), 400

                        face_encoding = str(encodings[0].tolist())

                        # Check for duplicate faces
                        cursor.execute('SELECT emp_id, face_encoding FROM users WHERE face_encoding != "[]"')
                        existing_faces = cursor.fetchall()

                        for existing_emp_id, existing_encoding_str in existing_faces:
                            try:
                                existing_encoding = np.array(eval(existing_encoding_str))
                                matches = face_recognition.compare_faces([existing_encoding], np.array(eval(face_encoding)))

                                if matches[0]:
                                    os.remove(image_path)
                                    return jsonify({
                                        'error': f'This face is already registered with employee ID: {existing_emp_id}'
                                    }), 400
                            except Exception as e:
                                app.logger.error(f"Error comparing faces: {str(e)}")
                                continue

                    except Exception as e:
                        app.logger.error(f"Face recognition error: {str(e)}")
                        os.remove(image_path)
                        return jsonify({
                            'error': 'Face recognition failed. Please upload a clear frontal face photo.'
                        }), 400

                except Exception as e:
                    app.logger.error(f"Error processing photo: {str(e)}")
                    return jsonify({'error': f'Error processing photo: {str(e)}'}), 400

            # Insert new employee
            hashed_password = generate_password_hash(data['password'])
            cursor.execute('''
                INSERT INTO users (emp_id, full_name, email, personal_email, 
                                 department, position, password, image_path, face_encoding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data['employeeId'],
                data['fullName'],
                data['email'],
                data.get('personalEmail', ''),
                data['department'],
                data['position'],
                hashed_password,
                image_path,
                face_encoding
            ))

            conn.commit()
            return jsonify({'success': True}), 201

        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/admin/api/employees/<emp_id>', methods=['GET', 'PUT', 'DELETE'])
@admin_required
def admin_api_single_employee(emp_id):
    if request.method == 'GET':
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT emp_id, full_name, email, personal_email, 
                   department, position, image_path 
            FROM users 
            WHERE emp_id = ?
        ''', (emp_id,))
        
        emp = cursor.fetchone()
        if not emp:
            return jsonify({'error': 'Employee not found'}), 404
            
        return jsonify({
            'emp_id': emp[0],
            'full_name': emp[1],
            'email': emp[2],
            'personal_email': emp[3],
            'department': emp[4],
            'position': emp[5],
            'image_path': emp[6]
        })
        
    elif request.method == 'PUT':
        data = request.get_json()
        
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            update_fields = []
            params = []
            
            if 'fullName' in data:
                update_fields.append('full_name = ?')
                params.append(data['fullName'])
                
            if 'personalEmail' in data:
                update_fields.append('personal_email = ?')
                params.append(data['personalEmail'])
                
            if 'department' in data:
                update_fields.append('department = ?')
                params.append(data['department'])
                
            if 'position' in data:
                update_fields.append('position = ?')
                params.append(data['position'])
                
            if 'password' in data and data['password']:
                hashed_password = generate_password_hash(data['password'])
                update_fields.append('password = ?')
                params.append(hashed_password)
                
            if not update_fields:
                return jsonify({'error': 'No fields to update'}), 400
                
            query = 'UPDATE users SET ' + ', '.join(update_fields) + ' WHERE emp_id = ?'
            params.append(emp_id)
            
            cursor.execute(query, params)
            conn.commit()
            
            return jsonify({'success': True})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    elif request.method == 'DELETE':
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # Get employee data including image path
            cursor.execute('SELECT image_path FROM users WHERE emp_id = ?', (emp_id,))
            result = cursor.fetchone()
            
            if not result:
                return jsonify({'error': 'Employee not found'}), 404
                
            image_path = result[0]
            
            # Delete the employee record
            cursor.execute('DELETE FROM users WHERE emp_id = ?', (emp_id,))
            
            # Also delete any attendance records for this employee
            cursor.execute('DELETE FROM attendance WHERE emp_id = ?', (emp_id,))
            
            conn.commit()
            
            # Delete the photo file if it exists and is not a placeholder
            if image_path and not image_path.startswith(('http', 'https')) and os.path.exists(image_path):
                try:
                    os.remove(image_path)
                    # Also try to remove the directory if it's empty
                    try:
                        dir_path = os.path.dirname(image_path)
                        if os.path.exists(dir_path) and not os.listdir(dir_path):
                            os.rmdir(dir_path)
                    except:
                        pass
                except Exception as e:
                    app.logger.error(f"Error deleting employee photo: {str(e)}")
                    return jsonify({
                        'success': True, 
                        'warning': 'Employee deleted but photo could not be removed'
                    })
            
            return jsonify({'success': True})
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
@app.route('/admin/send_employee_email', methods=['POST'])
@admin_required
def send_employee_email():
    try:
        data = request.get_json()
        to = data.get('to')
        subject = data.get('subject')
        message = data.get('message')

        if not all([to, subject, message]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400

        # Validate email format
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', to):
            return jsonify({'success': False, 'message': 'Invalid email format'}), 400

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = 'krishgolchha46@gmail.com'
        msg['To'] = to
        msg.set_content(message)
        msg.add_alternative(message, subtype='html')

        # Configure your SMTP server settings
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login('krishgolchha46@gmail.com', 'eqhd mdib orvk jkbt')
        server.send_message(msg)
        server.quit()

        return jsonify({'success': True, 'message': 'Email sent successfully'})
    except Exception as e:
        app.logger.error(f"Error sending email: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('home'))

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'faces'), exist_ok=True)
    os.makedirs('database', exist_ok=True)
    init_db()
    update_db_schema()
    app.run(debug=True)
