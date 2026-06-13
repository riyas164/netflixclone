from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
import hashlib
import secrets

# ── Works whether files are flat OR in subfolders ──────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, template_folder=BASE_DIR)
CORS(app)

DB_PATH = os.path.join(BASE_DIR, 'netflix_clone.db')

# ─── Database Setup ────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            email       TEXT    UNIQUE NOT NULL,
            password    TEXT    NOT NULL,
            plan        TEXT    DEFAULT 'standard',
            created_at  TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS movies (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            title        TEXT    NOT NULL,
            description  TEXT,
            genre        TEXT,
            release_year INTEGER,
            rating       REAL    DEFAULT 0.0,
            duration     TEXT,
            thumbnail    TEXT,
            banner       TEXT,
            video_url    TEXT,
            is_featured  INTEGER DEFAULT 0,
            created_at   TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            movie_id   INTEGER NOT NULL,
            added_at   TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id)  REFERENCES users(id),
            FOREIGN KEY (movie_id) REFERENCES movies(id),
            UNIQUE(user_id, movie_id)
        );

        CREATE TABLE IF NOT EXISTS watch_history (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL,
            movie_id     INTEGER NOT NULL,
            progress     INTEGER DEFAULT 0,
            watched_at   TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id)  REFERENCES users(id),
            FOREIGN KEY (movie_id) REFERENCES movies(id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            token      TEXT    UNIQUE NOT NULL,
            created_at TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    ''')

    c.execute("SELECT COUNT(*) FROM movies")
    if c.fetchone()[0] == 0:
        movies = [
            ('Stranger Things', 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces, and one strange little girl.', 'Sci-Fi/Horror', 2016, 8.7, '50m', 'https://picsum.photos/seed/st/400/225', 'https://picsum.photos/seed/st_b/1280/720', '#', 1),
            ('The Witcher',     'Geralt of Rivia, a mutated monster-hunter for hire, journeys toward his destiny in a turbulent world where people often prove more wicked than beasts.',  'Fantasy/Action', 2019, 8.2, '1h',  'https://picsum.photos/seed/tw/400/225', 'https://picsum.photos/seed/tw_b/1280/720', '#', 0),
            ('Ozark',           'A financial advisor drags his family from Chicago to the Missouri Ozarks, where he must launder $500 million to appease a drug boss.',                   'Crime/Drama',    2017, 8.4, '1h',  'https://picsum.photos/seed/oz/400/225', 'https://picsum.photos/seed/oz_b/1280/720', '#', 0),
            ('Dark',            'A missing child sets four families on a frantic hunt for answers as they unearth a mind-bending mystery that spans three generations.',                 'Mystery/Sci-Fi', 2017, 8.8, '1h',  'https://picsum.photos/seed/dk/400/225', 'https://picsum.photos/seed/dk_b/1280/720', '#', 0),
            ('Money Heist',     'An unusual group of robbers attempt to carry out the most perfect robbery in Spanish history — stealing 2.4 billion euros from the Royal Mint.',        'Action/Crime',   2017, 8.3, '50m', 'https://picsum.photos/seed/mh/400/225', 'https://picsum.photos/seed/mh_b/1280/720', '#', 0),
            ('Breaking Bad',    'A chemistry teacher diagnosed with cancer teams with a former student to secure his family by manufacturing meth.',                                     'Crime/Drama',    2008, 9.5, '47m', 'https://picsum.photos/seed/bb/400/225', 'https://picsum.photos/seed/bb_b/1280/720', '#', 1),
            ('Squid Game',      'Hundreds of cash-strapped players accept a strange invitation to compete in childrens games. Inside, a tempting prize awaits with deadly high stakes.', 'Thriller/Drama', 2021, 8.0, '1h',  'https://picsum.photos/seed/sg/400/225', 'https://picsum.photos/seed/sg_b/1280/720', '#', 0),
            ('Narcos',          'A look at the criminal exploits of Colombian drug lord Pablo Escobar and the many other drug kingpins who plagued the country.',                        'Crime/Biography',2015, 8.8, '45m', 'https://picsum.photos/seed/nc/400/225', 'https://picsum.photos/seed/nc_b/1280/720', '#', 0),
            ('The Crown',       'Follows the political rivalries and romance of Queen Elizabeth IIs reign and events that shaped the second half of the twentieth century.',             'Historical/Drama',2016, 8.7, '58m', 'https://picsum.photos/seed/tc/400/225', 'https://picsum.photos/seed/tc_b/1280/720', '#', 0),
            ('Bridgerton',      'Wealth, lust, and betrayal set against the backdrop of Regency-era England, seen through the eyes of the powerful Bridgerton family.',                'Romance/Drama',  2020, 7.3, '1h',  'https://picsum.photos/seed/br/400/225', 'https://picsum.photos/seed/br_b/1280/720', '#', 0),
            ('Wednesday',       'Wednesday Addams investigates a murder spree while making new friends at Nevermore Academy.',                                                          'Horror/Comedy',  2022, 8.1, '1h',  'https://picsum.photos/seed/wd/400/225', 'https://picsum.photos/seed/wd_b/1280/720', '#', 0),
            ('Peaky Blinders',  'A gangster family epic set in 1900s England, centering on a gang who sew razor blades in the peaks of their caps, and their fierce boss Tommy Shelby.','Crime/Drama',   2013, 8.8, '1h',  'https://picsum.photos/seed/pb/400/225', 'https://picsum.photos/seed/pb_b/1280/720', '#', 1),
        ]
        c.executemany(
            "INSERT INTO movies (title,description,genre,release_year,rating,duration,thumbnail,banner,video_url,is_featured) VALUES (?,?,?,?,?,?,?,?,?,?)",
            movies
        )

    conn.commit()
    conn.close()

# ─── Helpers ───────────────────────────────────────────────────────────────

def hash_password(p):
    return hashlib.sha256(p.encode()).hexdigest()

def get_user_from_token(token):
    if not token:
        return None
    conn = get_db()
    row = conn.execute(
        "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=?", (token,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

# ─── Serve HTML / static files ─────────────────────────────────────────────

@app.route('/')
def index():
    # Try index.html first, then index (1).html (renamed copy)
    for name in ['index.html', 'index (1).html']:
        path = os.path.join(BASE_DIR, name)
        if os.path.exists(path):
            return send_from_directory(BASE_DIR, name)
    return "index.html not found in " + BASE_DIR, 404

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(BASE_DIR, filename)

# ─── Auth ──────────────────────────────────────────────────────────────────

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    name, email, password = data.get('name','').strip(), data.get('email','').strip(), data.get('password','')
    if not all([name, email, password]):
        return jsonify({'error': 'All fields required'}), 400
    conn = get_db()
    try:
        conn.execute("INSERT INTO users (name,email,password) VALUES (?,?,?)",
                     (name, email, hash_password(password)))
        conn.commit()
        user  = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        token = secrets.token_hex(32)
        conn.execute("INSERT INTO sessions (user_id,token) VALUES (?,?)", (user['id'], token))
        conn.commit()
        return jsonify({'token': token, 'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'plan': user['plan']}})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already registered'}), 409
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    email, password = data.get('email','').strip(), data.get('password','')
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email=? AND password=?",
                        (email, hash_password(password))).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'Invalid email or password'}), 401
    token = secrets.token_hex(32)
    conn.execute("INSERT INTO sessions (user_id,token) VALUES (?,?)", (user['id'], token))
    conn.commit()
    conn.close()
    return jsonify({'token': token, 'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'plan': user['plan']}})

@app.route('/api/logout', methods=['POST'])
def logout():
    token = request.headers.get('Authorization','').replace('Bearer ','')
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Logged out'})

@app.route('/api/me', methods=['GET'])
def me():
    token = request.headers.get('Authorization','').replace('Bearer ','')
    user  = get_user_from_token(token)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify({'id': user['id'], 'name': user['name'], 'email': user['email'], 'plan': user['plan']})

# ─── Movies ────────────────────────────────────────────────────────────────

@app.route('/api/movies', methods=['GET'])
def get_movies():
    genre  = request.args.get('genre')
    search = request.args.get('search')
    conn   = get_db()
    query, params = "SELECT * FROM movies WHERE 1=1", []
    if genre and genre != 'All':
        query += " AND genre LIKE ?"; params.append(f'%{genre}%')
    if search:
        query += " AND title LIKE ?"; params.append(f'%{search}%')
    movies = [dict(r) for r in conn.execute(query, params).fetchall()]
    conn.close()
    return jsonify(movies)

@app.route('/api/movies/featured', methods=['GET'])
def get_featured():
    conn   = get_db()
    movies = [dict(r) for r in conn.execute("SELECT * FROM movies WHERE is_featured=1").fetchall()]
    conn.close()
    return jsonify(movies)

@app.route('/api/movies/<int:movie_id>', methods=['GET'])
def get_movie(movie_id):
    conn  = get_db()
    movie = conn.execute("SELECT * FROM movies WHERE id=?", (movie_id,)).fetchone()
    conn.close()
    return jsonify(dict(movie)) if movie else (jsonify({'error': 'Not found'}), 404)

# ─── Watchlist ─────────────────────────────────────────────────────────────

@app.route('/api/watchlist', methods=['GET'])
def get_watchlist():
    token = request.headers.get('Authorization','').replace('Bearer ','')
    user  = get_user_from_token(token)
    if not user: return jsonify({'error': 'Unauthorized'}), 401
    conn  = get_db()
    rows  = conn.execute(
        "SELECT m.* FROM movies m JOIN watchlist w ON m.id=w.movie_id WHERE w.user_id=? ORDER BY w.added_at DESC",
        (user['id'],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/watchlist/<int:movie_id>', methods=['POST'])
def add_watchlist(movie_id):
    token = request.headers.get('Authorization','').replace('Bearer ','')
    user  = get_user_from_token(token)
    if not user: return jsonify({'error': 'Unauthorized'}), 401
    conn  = get_db()
    try:
        conn.execute("INSERT INTO watchlist (user_id,movie_id) VALUES (?,?)", (user['id'], movie_id))
        conn.commit()
        return jsonify({'message': 'Added to watchlist'})
    except sqlite3.IntegrityError:
        return jsonify({'message': 'Already in watchlist'})
    finally:
        conn.close()

@app.route('/api/watchlist/<int:movie_id>', methods=['DELETE'])
def remove_watchlist(movie_id):
    token = request.headers.get('Authorization','').replace('Bearer ','')
    user  = get_user_from_token(token)
    if not user: return jsonify({'error': 'Unauthorized'}), 401
    conn  = get_db()
    conn.execute("DELETE FROM watchlist WHERE user_id=? AND movie_id=?", (user['id'], movie_id))
    conn.commit(); conn.close()
    return jsonify({'message': 'Removed'})

# ─── History ───────────────────────────────────────────────────────────────

@app.route('/api/history', methods=['GET'])
def get_history():
    token = request.headers.get('Authorization','').replace('Bearer ','')
    user  = get_user_from_token(token)
    if not user: return jsonify({'error': 'Unauthorized'}), 401
    conn  = get_db()
    rows  = conn.execute(
        "SELECT m.*, h.progress, h.watched_at FROM movies m JOIN watch_history h ON m.id=h.movie_id WHERE h.user_id=? ORDER BY h.watched_at DESC LIMIT 20",
        (user['id'],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/history/<int:movie_id>', methods=['POST'])
def add_history(movie_id):
    token    = request.headers.get('Authorization','').replace('Bearer ','')
    user     = get_user_from_token(token)
    if not user: return jsonify({'error': 'Unauthorized'}), 401
    progress = (request.json or {}).get('progress', 0)
    conn     = get_db()
    conn.execute("INSERT INTO watch_history (user_id,movie_id,progress) VALUES (?,?,?)",
                 (user['id'], movie_id, progress))
    conn.commit(); conn.close()
    return jsonify({'message': 'History updated'})

# ─── Stats ─────────────────────────────────────────────────────────────────

@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = get_db()
    stats = {
        'total_users':     conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        'total_movies':    conn.execute("SELECT COUNT(*) FROM movies").fetchone()[0],
        'total_watchlist': conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0],
        'total_views':     conn.execute("SELECT COUNT(*) FROM watch_history").fetchone()[0],
    }
    conn.close()
    return jsonify(stats)

# ─── Run ───────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    print("✅ Database initialised — Netflix Clone running on http://localhost:5000")
    app.run(debug=True, port=5000)