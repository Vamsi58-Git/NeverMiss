<?php
/**
 * getOpportunities.php — GET /api/getOpportunities.php
 *
 * Returns all opportunities ordered by deadline (soonest first).
 * Supports optional filters:
 *   ?status=Applied
 *   ?category=Internship
 *   ?deadline_before=2026-12-31
 *
 * Response: JSON array of opportunity objects.
 */

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'error' => 'Method not allowed'], 405);
}

// Optional filters
$statusFilter = $_GET['status'] ?? null;
$categoryFilter = $_GET['category'] ?? null;
$deadlineBefore = $_GET['deadline_before'] ?? null;

try {
    $sql = 'SELECT * FROM opportunities WHERE 1=1';
    $params = [];

    if ($statusFilter !== null && $statusFilter !== '') {
        $sql .= ' AND status = :status';
        $params[':status'] = $statusFilter;
    }
    if ($categoryFilter !== null && $categoryFilter !== '') {
        $sql .= ' AND category = :category';
        $params[':category'] = $categoryFilter;
    }
    if ($deadlineBefore !== null && $deadlineBefore !== '') {
        $d = DateTime::createFromFormat('Y-m-d', $deadlineBefore);
        if ($d && $d->format('Y-m-d') === $deadlineBefore) {
            $sql .= ' AND deadline IS NOT NULL AND deadline <= :deadline_before';
            $params[':deadline_before'] = $deadlineBefore;
        }
    }

    $sql .= ' ORDER BY (deadline IS NULL), deadline ASC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $opportunities = $stmt->fetchAll();

    // Cast id to string so the React frontend receives consistent types
    foreach ($opportunities as &$row) {
        $row['id'] = (string) $row['id'];
    }
    unset($row);

    json_response(['success' => true, 'data' => $opportunities]);

} catch (PDOException $e) {
    json_response(['success' => false, 'error' => $e->getMessage()], 500);
}
