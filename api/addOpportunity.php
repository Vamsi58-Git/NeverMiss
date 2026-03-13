<?php
/**
 * addOpportunity.php — POST /api/addOpportunity.php
 *
 * Accepts a JSON body with opportunity fields and inserts a new row.
 *
 * Body fields (all optional except company/role):
 *   company  (string, required)
 *   role     (string, required)
 *   deadline (string YYYY-MM-DD, optional)
 *   link     (string URL, optional)
 *   source   (string, optional – default 'Other')
 *   category (string, optional – default 'Internship')
 *   status   (string, optional – default 'Not Applied')
 *
 * Response: { success: true, id: "<new-id>" }
 */

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'error' => 'Method not allowed'], 405);
}

// Parse JSON body
$body = json_decode(file_get_contents('php://input'), true);

if (!is_array($body)) {
    json_response(['success' => false, 'error' => 'Invalid JSON body'], 400);
}

// ── Validate required fields ──────────────────────────────────────────────────
$company = trim($body['company'] ?? '');
$role    = trim($body['role']    ?? '');

if ($company === '' || $role === '') {
    json_response([
        'success' => false,
        'error'   => 'Fields "company" and "role" are required',
    ], 422);
}

// ── Sanitise optional fields ──────────────────────────────────────────────────
$deadline = null;
if (!empty($body['deadline'])) {
    // Accept YYYY-MM-DD; reject anything else
    $d = DateTime::createFromFormat('Y-m-d', $body['deadline']);
    if ($d && $d->format('Y-m-d') === $body['deadline']) {
        $deadline = $body['deadline'];
    }
}

$link   = trim($body['link']   ?? '');
$source = trim($body['source'] ?? 'Other');
$category = trim($body['category'] ?? 'Internship');
$status = trim($body['status'] ?? 'Not Applied');

// Only allow known category values
if (!in_array($category, ['Internship', 'Hackathon', 'Scholarship', 'Job'], true)) {
    $category = 'Internship';
}

// Only allow known status values
if (!in_array($status, ['Not Applied', 'Applied', 'Rejected', 'Accepted'], true)) {
    $status = 'Not Applied';
}

// ── Insert ────────────────────────────────────────────────────────────────────
try {
    // Prevent duplicates by normalized company+role+deadline+link (link optional)
    $dupStmt = $pdo->prepare(
        'SELECT id FROM opportunities
         WHERE LOWER(TRIM(company)) = LOWER(TRIM(:company))
           AND LOWER(TRIM(role)) = LOWER(TRIM(:role))
           AND ((deadline IS NULL AND :deadline IS NULL) OR deadline = :deadline)
           AND ((link IS NULL AND :link IS NULL) OR link = :link)
         LIMIT 1'
    );
    $dupStmt->execute([
        ':company'  => $company,
        ':role'     => $role,
        ':deadline' => $deadline,
        ':link'     => $link ?: null,
    ]);

    if ($dupStmt->fetch()) {
        json_response([
            'success' => false,
            'error'   => 'Duplicate opportunity already exists',
        ], 409);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO opportunities (company, role, deadline, link, source, category, status)
         VALUES (:company, :role, :deadline, :link, :source, :category, :status)'
    );

    $stmt->execute([
        ':company'  => $company,
        ':role'     => $role,
        ':deadline' => $deadline,
        ':link'     => $link ?: null,
        ':source'   => $source,
        ':category' => $category,
        ':status'   => $status,
    ]);

    json_response([
        'success' => true,
        'id'      => (string) $pdo->lastInsertId(),
    ], 201);

} catch (PDOException $e) {
    json_response(['success' => false, 'error' => $e->getMessage()], 500);
}
