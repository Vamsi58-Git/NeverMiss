<?php
/**
 * updateStatus.php — PATCH /api/updateStatus.php
 *
 * Updates the application status of a single opportunity.
 *
 * Body: { "id": "42", "status": "Not Applied" | "Applied" | "Rejected" | "Accepted" }
 *
 * Response: { success: true }
 */

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);

$id     = (int)  ($body['id']     ?? 0);
$status = trim(   $body['status'] ?? '');

if ($id <= 0) {
    json_response(['success' => false, 'error' => 'Valid "id" is required'], 422);
}

if (!in_array($status, ['Not Applied', 'Applied', 'Rejected', 'Accepted'], true)) {
    json_response([
        'success' => false,
        'error'   => '"status" must be one of: Not Applied, Applied, Rejected, Accepted',
    ], 422);
}

try {
    $stmt = $pdo->prepare(
        'UPDATE opportunities SET status = :status WHERE id = :id'
    );
    $stmt->execute([':status' => $status, ':id' => $id]);

    if ($stmt->rowCount() === 0) {
        json_response(['success' => false, 'error' => 'Opportunity not found'], 404);
    }

    json_response(['success' => true]);

} catch (PDOException $e) {
    json_response(['success' => false, 'error' => $e->getMessage()], 500);
}
