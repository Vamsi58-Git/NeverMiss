<?php
/**
 * login.php — POST /api/login.php
 * Body: { "email": string, "password": string }
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

$email = strtolower(trim($body['email'] ?? ''));
$password = (string)($body['password'] ?? '');

if ($email === '' || $password === '') {
    json_response(['success' => false, 'error' => 'Email and password are required'], 422);
}

try {
    $stmt = $pdo->prepare('SELECT id, name, email, password_hash FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_response(['success' => false, 'error' => 'Invalid credentials'], 401);
    }

    // Send login notification email
    $loginTime = date('D, d M Y H:i:s T');
    $ip        = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $emailBody = email_template(
        'New Login to Your NeverMiss Account',
        "<p style='color:#475569;font-size:15px;line-height:1.6;'>Hi <strong>{$user['name']}</strong>,</p>
        <p style='color:#475569;font-size:15px;line-height:1.6;'>A successful login was detected on your account.</p>
        <table style='width:100%;border-collapse:collapse;margin:16px 0;'>
          <tr><td style='padding:8px 12px;background:#fef9c3;border-radius:6px 0 0 6px;color:#92400e;font-size:13px;font-weight:700;white-space:nowrap;'>Time</td><td style='padding:8px 12px;background:#fefce8;border-radius:0 6px 6px 0;color:#334155;font-size:13px;'>$loginTime</td></tr>
          <tr><td style='padding:8px 12px;background:#dbeafe;border-radius:6px 0 0 6px;color:#1e40af;font-size:13px;font-weight:700;white-space:nowrap;'>IP Address</td><td style='padding:8px 12px;background:#eff6ff;border-radius:0 6px 6px 0;color:#334155;font-size:13px;'>$ip</td></tr>
        </table>
        <p style='color:#94a3b8;font-size:13px;'>If this wasn't you, please reset your password immediately.</p>"
    );
    send_email($user['email'], 'NeverMiss: New Login Detected', $emailBody);

    json_response([
        'success' => true,
        'user' => [
            'id' => (string)$user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
        ],
    ]);

} catch (PDOException $e) {
    json_response(['success' => false, 'error' => $e->getMessage()], 500);
}
