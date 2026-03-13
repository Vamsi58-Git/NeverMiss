<?php
/**
 * deleteOpportunity.php — DELETE /api/deleteOpportunity.php
 *
 * Deletes an opportunity by its id.
 *
 * Body: { "id": "42" }  — or pass ?id=42 as query param.
 *
 * Response: { success: true }
 */

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'error' => 'Method not allowed'], 405);
}

// Support both JSON body and query string
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$id   = (int) ($body['id'] ?? $_GET['id'] ?? 0);

if ($id <= 0) {
    json_response(['success' => false, 'error' => 'Valid "id" is required'], 422);
}

try {
    $stmt = $pdo->prepare('DELETE FROM opportunities WHERE id = :id');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        json_response(['success' => false, 'error' => 'Opportunity not found'], 404);
    }

    json_response(['success' => true]);

} catch (PDOException $e) {
    json_response(['success' => false, 'error' => $e->getMessage()], 500);
}
