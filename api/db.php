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
// Environment variables are used in production platforms like Render.
// Supports either:
//   1) DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS
//   2) DATABASE_URL (mysql://user:pass@host:port/dbname)
$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbPort = getenv('DB_PORT') ?: '3306';
$dbName = getenv('DB_NAME') ?: 'nevermiss';
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASS') ?: '';

$databaseUrl = getenv('DATABASE_URL') ?: '';
if ($databaseUrl !== '') {
    $parts = parse_url($databaseUrl);
    if ($parts !== false) {
        $scheme = strtolower($parts['scheme'] ?? '');
        if ($scheme === 'mysql' || $scheme === 'mariadb') {
            $dbHost = $parts['host'] ?? $dbHost;
            $dbPort = isset($parts['port']) ? (string) $parts['port'] : $dbPort;
            $dbUser = $parts['user'] ?? $dbUser;
            $dbPass = $parts['pass'] ?? $dbPass;
            if (!empty($parts['path'])) {
                $dbName = ltrim($parts['path'], '/');
            }
        }
    }
}

define('DB_HOST', $dbHost);
define('DB_PORT', $dbPort);
define('DB_NAME', $dbName);
define('DB_USER', $dbUser);
define('DB_PASS', $dbPass);
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
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        DB_HOST,
        DB_PORT,
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
