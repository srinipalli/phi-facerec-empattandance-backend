from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_from_directory
import os
import sqlite3
import face_recognition
import numpy as np
from datetime import datetime
import base64
import requests
from PIL import Image
import io

app = Flask(__name__)
app.secret_key = 'supersecretkey'
UPLOAD_FOLDER = 'static/uploads/faces'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Database setup
def init_db():
    with sqlite3.connect('database/users.db', timeout=10) as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        email TEXT NOT NULL,
                        empId TEXT NOT NULL,
                        face_encoding BLOB NOT NULL
                    )''')
        c.execute('''CREATE TABLE IF NOT EXISTS attendance (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT,
                        intime TEXT,
                        outtime TEXT,
                        latitude TEXT,
                        longitude TEXT,
                        address TEXT
                    )''')
        c.execute('''CREATE TABLE IF NOT EXISTS regularizations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT,
                        intime TEXT,
                        corrected_outtime TEXT,
                        reason TEXT,
                        comment TEXT
                    )''')
        conn.commit()

init_db()

def reverse_geocode(lat, lon):
    try:
        url = f"https://nominatim.openstreetmap.org/reverse"
        params = {
            'lat': lat,
            'lon': lon,
            'format': 'json',
            'zoom': 18,
            'addressdetails': 1
        }
        headers = {'User-Agent': 'FaceAttendanceApp'}
        response = requests.get(url, params=params, headers=headers)
        data = response.json()
        return data.get('display_name', 'Address not found')
    except Exception as e:
        return 'Error fetching address'


@app.route('/')
def home():
    return render_template('home.html')

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

# Signup route
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'GET':
        return render_template('signup.html')

    data = request.get_json()
    username = data['username']
    email = data['email']
    empId = data['empId']
    image_data = data['image_data'].split(',')[1]

    try:
        image = Image.open(io.BytesIO(base64.b64decode(image_data))).convert('RGB')
        input_rgb = np.array(image)
        encodings = face_recognition.face_encodings(input_rgb)
        if len(encodings) == 0:
            return 'Face not detected. Try a clearer image.'
        face_encoding = np.array(encodings[0], dtype=np.float64)

        with sqlite3.connect('database/users.db', timeout=10) as conn:
            c = conn.cursor()
            c.execute("INSERT INTO users (username, email, empId, face_encoding) VALUES (?, ?, ?, ?)", 
                      (username, email, empId, face_encoding.tobytes()))
            conn.commit()
        return '/login'
    except sqlite3.IntegrityError:
        return 'Username already exists.'


# Login route
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('login.html')

    if request.is_json:
        data = request.get_json()
        empId = data.get('empId', '').strip()
        image_data = data['image'].split(',')[1]
        image_bytes = base64.b64decode(image_data)

        try:
            image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
            input_rgb = np.array(image)
            encodings = face_recognition.face_encodings(input_rgb)
            if not encodings:
                return jsonify({'error': 'No face found.'}), 400
            input_encoding = np.array(encodings[0], dtype=np.float64)

            with sqlite3.connect('database/users.db', timeout=10) as conn:
                c = conn.cursor()

                if empId:
                    c.execute("SELECT face_encoding, empId FROM users WHERE empId = ?", (empId,))
                    row = c.fetchone()
                    if row:
                        stored_encoding = np.frombuffer(row[0], dtype=np.float64)
                        if face_recognition.compare_faces([stored_encoding], input_encoding, tolerance=0.45)[0]:
                            session['username'] = row[1]
                            with sqlite3.connect('database/users.db', timeout=10) as conn2:
                                c2 = conn2.cursor()
                                c2.execute("SELECT * FROM attendance WHERE username = ? AND DATE(intime) = DATE('now')", (session['username'],))
                                if not c2.fetchone():
                                    now = datetime.now()
                                    c2.execute("INSERT INTO attendance (username, intime, latitude, longitude, address) VALUES (?, ?, ?, ?, ?)", 
                                               (session['username'], now.strftime('%Y-%m-%d %H:%M:%S'), '', '', ''))
                                    conn2.commit()
                            return jsonify({'redirect': '/dashboard'})
                        else:
                            return jsonify({'error': 'Face does not match ID'}), 403
                    else:
                        return jsonify({'error': 'ID not found'}), 404
                else:
                    c.execute("SELECT empId, face_encoding FROM users")
                    for row in c.fetchall():
                        user_id, encoding_blob = row
                        stored_encoding = np.frombuffer(encoding_blob, dtype=np.float64)
                        if face_recognition.compare_faces([stored_encoding], input_encoding, tolerance=0.45)[0]:
                            session['username'] = user_id
                            with sqlite3.connect('database/users.db', timeout=10) as conn2:
                                c2 = conn2.cursor()
                                c2.execute("SELECT * FROM attendance WHERE username = ? AND DATE(intime) = DATE('now')", (session['username'],))
                                if not c2.fetchone():
                                    now = datetime.now()
                                    c2.execute("INSERT INTO attendance (username, intime, latitude, longitude, address) VALUES (?, ?, ?, ?, ?)", 
                                               (session['username'], now.strftime('%Y-%m-%d %H:%M:%S'), '', '', ''))
                                    conn2.commit()
                            return jsonify({'redirect': '/dashboard'})
                    return jsonify({'error': 'Face not recognized'}), 401
        except Exception as e:
            return jsonify({'error': f'Error processing image: {str(e)}'}), 500



#admin signup    
@app.route('/admin_signup', methods=['GET', 'POST'])
def admin_signup():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        try:
            with sqlite3.connect('database/users.db', timeout=10) as conn:
                c = conn.cursor()
                c.execute('''CREATE TABLE IF NOT EXISTS admins (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                username TEXT UNIQUE NOT NULL,
                                password TEXT NOT NULL
                            )''')
                c.execute("INSERT INTO admins (username, password) VALUES (?, ?)", (username, password))
                conn.commit()
            return redirect(url_for('admin_login'))
        except sqlite3.IntegrityError:
            return 'Admin username already exists.'

    return render_template('admin_signup.html')


@app.route('/admin_dashboard', methods=['GET', 'POST'])
def admin_dashboard():
    if 'admin' not in session:
        return redirect(url_for('admin_login'))

    selected_date = request.args.get('date')
    sort_param = request.args.get('sort', 'intime_asc')  # Combined sort field and order

    # Extract sort field and order
    if '_' in sort_param:
        sort_by, order = sort_param.split('_')
    else:
        sort_by, order = 'intime', 'asc'

    conn = sqlite3.connect('database/users.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    base_query = """
    SELECT attendance.username, users.empId AS employee_id, intime, outtime, latitude, longitude, address 
    FROM attendance 
    JOIN users ON attendance.username = users.empId
    """
    params = []

    if selected_date:
        base_query += " WHERE DATE(intime) = ?"
        params.append(selected_date)

    if sort_by in ['intime', 'outtime'] and order in ['asc', 'desc']:
        base_query += f" ORDER BY {sort_by} {order.upper()}"

    c.execute(base_query, params)
    rows = c.fetchall()
    conn.close()

    return render_template('admin_dashboard.html', records=rows, selected_date=selected_date, sort_by=sort_param)

#admin login
@app.route('/admin_login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        with sqlite3.connect('database/users.db', timeout=10) as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM admins WHERE username = ? AND password = ?", (username, password))
            admin = c.fetchone()
        

        if admin:
            session['admin'] = username
            return redirect(url_for('admin_dashboard'))
        else:
            return 'Invalid admin credentials.'

    return render_template('admin_login.html')



# Route: Dashboard
@app.route('/dashboard')
def dashboard():
    if 'username' not in session:
        return redirect(url_for('login'))

    username = session['username']

    # Check latest attendance record
    with sqlite3.connect('database/users.db', timeout=10) as conn:
        c = conn.cursor()
        c.execute('''
            SELECT outtime FROM attendance
            WHERE username = ?
            ORDER BY intime DESC
            LIMIT 1
        ''', (username,))
        row = c.fetchone()


    if row is None:
        status = "OUT"
    elif row[0] is None:
        status = "IN"
    else:
        status = "OUT"

    return render_template('dashboard.html', username=username, status=status)

@app.route('/summary')
def summary():
    username = session.get('username', 'Unknown User')

    conn = sqlite3.connect('database/users.db')
    cursor = conn.cursor()

    cursor.execute('''
        SELECT 
            DATE(a.intime),                 -- row[0]: Date
            TIME(a.intime),                -- row[1]: Punch-In Time
            TIME(a.outtime),               -- row[2]: Punch-Out Time
            a.address,                     -- row[3]: Location
            r.corrected_outtime,                     -- row[4]: Regularized Punch-Out Time
            r.reason,                      -- row[5]: Reason
            r.comment                      -- row[6]: Comment
        FROM attendance a
        LEFT JOIN regularizations r 
        ON a.username = r.username AND a.intime = r.intime
        WHERE a.username = ?
        ORDER BY a.intime DESC
    ''', (username,))

    summary_data = cursor.fetchall()
    conn.close()

    return render_template('summary.html', summary=summary_data, username=username)




@app.route('/regularize', methods=['POST'])
def regularize():
    if 'username' not in session:
        return jsonify({'message': 'Unauthorized'}), 401

    username = session['username']
    intime = request.form['intime']
    out_time_only = request.form['out_time']
    reason = request.form['reason']
    comment = request.form.get('comment', '')

    # Combine date from intime with time-only out_time
    date_part = intime.split(' ')[0]
    outtime = f"{date_part} {out_time_only}"

    conn = sqlite3.connect('database/users.db')
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO regularizations (username, intime, corrected_outtime, reason, comment)
        VALUES (?, ?, ?, ?, ?)
    ''', (username, intime, outtime, reason, comment))

    conn.commit()
    conn.close()

    return jsonify({'message': 'Regularization submitted successfully.'})


# Route: Attendance Punch
@app.route('/punchin', methods=['POST'])
def punchin():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    username = session['username']
    intime = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    latitude = data.get('latitude')
    longitude = data.get('longitude')

    with sqlite3.connect('database/users.db', timeout=10) as conn:
        c = conn.cursor()
        address = reverse_geocode(latitude, longitude)
        c.execute("INSERT INTO attendance (username, intime, latitude, longitude, address) VALUES (?, ?, ?, ?, ?)",
                  (username, intime, latitude, longitude, address))
        conn.commit()
    return jsonify({'status': 'success'})

@app.route('/punchout', methods=['POST'])
def punchout():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized', 'message': 'Please login first'}), 401

    try:
        data = request.get_json()
        username = session['username']
        outtime = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        latitude = data.get('latitude')
        longitude = data.get('longitude')

        with sqlite3.connect('database/users.db') as conn:
            c = conn.cursor()
            
            # Find the latest attendance record with NULL outtime
            c.execute('''
                SELECT id FROM attendance
                WHERE username = ? AND outtime IS NULL
                ORDER BY intime DESC LIMIT 1
            ''', (username,))
            row = c.fetchone()

            if not row:
                return jsonify({
                    'error': 'No punch-in found',
                    'message': 'You need to punch in first'
                }), 400

            attendance_id = row[0]
            address = reverse_geocode(latitude, longitude)
            cleaned_address = address

            c.execute('''
                UPDATE attendance
                SET outtime = ?, latitude = ?, longitude = ?, address = ?
                WHERE id = ?
            ''', (outtime, latitude, longitude, cleaned_address, attendance_id))
            
            conn.commit()
            return jsonify({
                'status': 'success',
                'message': 'Punch-out recorded successfully'
            })

    except Exception as e:
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


# Route: Logout
@app.route('/logout')
def logout():
    is_admin = 'admin' in session
    session.clear()
    if is_admin:
        return redirect(url_for('home'))  # Redirects to `/`
    return redirect(url_for('home'))

if __name__ == '__main__':
    app.run(debug=True)
