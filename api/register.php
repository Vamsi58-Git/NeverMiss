<?php
/**
 * register.php — POST /api/register.php
 * Body: { "name": string, "email": string, "password": string }
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    json_response(['success' => false, 'error' => 'Invalid JSON body'], 400);
}

$name = trim($body['name'] ?? '');
$email = strtolower(trim($body['email'] ?? ''));
$password = (string)($body['password'] ?? '');

if ($name === '' || $email === '' || $password === '') {
    json_response(['success' => false, 'error' => 'Name, email and password are required'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(['success' => false, 'error' => 'Invalid email format'], 422);
}

if (strlen($password) < 6) {
    json_response(['success' => false, 'error' => 'Password must be at least 6 characters'], 422);
}

try {
    $existsStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $existsStmt->execute([':email' => $email]);
    if ($existsStmt->fetch()) {
        json_response(['success' => false, 'error' => 'Email already registered'], 409);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare(
        'INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :password_hash)'
    );
    $stmt->execute([
        ':name' => $name,
        ':email' => $email,
        ':password_hash' => $passwordHash,
    ]);

    // Send welcome email
    $newId     = (string)$pdo->lastInsertId();
    $emailBody = email_template(
        'Welcome to NeverMiss, ' . htmlspecialchars($name) . '!',
        "<p style='color:#475569;font-size:15px;line-height:1.6;'>Your account has been created successfully.</p>
        <table style='width:100%;border-collapse:collapse;margin:16px 0;'>
          <tr><td style='padding:8px 12px;background:#fef9c3;border-radius:6px 0 0 6px;color:#92400e;font-size:13px;font-weight:700;'>Name</td><td style='padding:8px 12px;background:#fefce8;border-radius:0 6px 6px 0;color:#334155;font-size:13px;'>" . htmlspecialchars($name) . "</td></tr>
          <tr><td style='padding:8px 12px;background:#dbeafe;border-radius:6px 0 0 6px;color:#1e40af;font-size:13px;font-weight:700;'>Email</td><td style='padding:8px 12px;background:#eff6ff;border-radius:0 6px 6px 0;color:#334155;font-size:13px;'>" . htmlspecialchars($email) . "</td></tr>
        </table>
        <p style='color:#475569;font-size:15px;line-height:1.6;'>Start capturing opportunities by pasting messages from WhatsApp, LinkedIn, or email directly into the dashboard.</p>
        <p style='color:#94a3b8;font-size:13px;'>Never miss a deadline again. 🎯</p>"
    );
    send_email($email, 'Welcome to NeverMiss — Account Created', $emailBody);

    json_response([
        'success' => true,
        'user' => [
            'id' => $newId,
            'name' => $name,
            'email' => $email,
        ],
    ], 201);

} catch (PDOException $e) {
    json_response(['success' => false, 'error' => $e->getMessage()], 500);
}
