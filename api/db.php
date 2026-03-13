<?php
/**
 * db.php — Shared database connection for NeverMiss API
 *
 * Include this file in every API endpoint:
 *   require_once __DIR__ . '/db.php';
 *
 * Returns a ready-to-use PDO object in $pdo.
 */

// ── Database credentials ──────────────────────────────────────────────────────
define('DB_HOST', 'localhost');
define('DB_NAME', 'nevermiss');
define('DB_USER', 'root');   // Default XAMPP user – change if needed
define('DB_PASS', '');       // Default XAMPP password – change if needed
define('DB_CHARSET', 'utf8mb4');
// ─────────────────────────────────────────────────────────────────────────────

// ── CORS headers – allow requests from the Vite dev server ───────────────────
$allowed_origins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins, true)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    // During development, allow all; tighten for production.
    header('Access-Control-Allow-Origin: *');
}

header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// Handle pre-flight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Create PDO connection ─────────────────────────────────────────────────────
try {
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        DB_HOST,
        DB_NAME,
        DB_CHARSET
    );

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Database connection failed: ' . $e->getMessage(),
    ]);
    exit;
}

/**
 * json_response() — Helper to send a JSON response and exit.
 *
 * @param mixed $data        The data to encode.
 * @param int   $statusCode  HTTP status code (default 200).
 */
function json_response(mixed $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
