<?php
/**
 * extractOpportunity.php — POST /api/extractOpportunity.php
 *
 * Accepts { "text": "<pasted text>" }
 * Returns  { success: true, data: { company, role, deadline, link, source } }
 *
 * Extraction priority:
 *   1. Labelled fields  (Company: X / Role: X / Deadline: X)  — most reliable
 *   2. Context-aware patterns  (near trigger words)
 *   3. Broad fallback patterns
 */

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);
$raw  = trim($body['text'] ?? '');

if ($raw === '') {
    json_response(['success' => false, 'error' => 'Field "text" is required'], 400);
}

// Normalise: collapse runs of whitespace but keep newlines meaningful
$text  = $raw;
$clean = preg_replace('/[ \t]+/', ' ', $text);   // collapse spaces/tabs, keep \n
$flat  = preg_replace('/\s+/', ' ', $text);        // fully flat version

// ─────────────────────────────────────────────────────────────────────────
// MONTH MAP
// ─────────────────────────────────────────────────────────────────────────
$monthMap = [
    'jan'=>'01','january'=>'01','feb'=>'02','february'=>'02',
    'mar'=>'03','march'=>'03','apr'=>'04','april'=>'04',
    'may'=>'05','jun'=>'06','june'=>'06','jul'=>'07','july'=>'07',
    'aug'=>'08','august'=>'08','sep'=>'09','september'=>'09',
    'oct'=>'10','october'=>'10','nov'=>'11','november'=>'11',
    'dec'=>'12','december'=>'12',
];

function toISO(array $m, string $type, array $monthMap): ?string {
    try {
        switch ($type) {
            case 'iso':   return "{$m[1]}-{$m[2]}-{$m[3]}";
            case 'dmy':   return "{$m[3]}-{$m[2]}-" . str_pad($m[1], 2, '0', STR_PAD_LEFT);
            case 'mdy':   return "{$m[3]}-{$m[1]}-" . str_pad($m[2], 2, '0', STR_PAD_LEFT);
            case 'dMonY':
                $mo = $monthMap[strtolower($m[2])] ?? null;
                return $mo ? "{$m[3]}-{$mo}-" . str_pad($m[1], 2, '0', STR_PAD_LEFT) : null;
            case 'MonDY':
                $mo = $monthMap[strtolower($m[1])] ?? null;
                return $mo ? "{$m[3]}-{$mo}-" . str_pad($m[2], 2, '0', STR_PAD_LEFT) : null;
        }
    } catch (Exception $e) {}
    return null;
}

function extractFirstDate(string $haystack, array $monthMap): ?string {
    $MON = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
    $patterns = [
        ['#\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b#', 'iso'],
        ['#\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})\b#', 'dmy'],
        ['#\b(\d{1,2})\s+('.$MON.')[,\s]+(\d{4})\b#i', 'dMonY'],
        ['#\b('.$MON.')\s+(\d{1,2})[,\s]+(\d{4})\b#i', 'MonDY'],
        ['#\b(\d{1,2})[-/]('.$MON.')[-/](\d{4})\b#i', 'dMonY'],
        ['#\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](20\d{2})\b#', 'mdy'],
        ['#\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?('.$MON.')[,\s]+(\d{4})\b#i', 'dMonY'],
        ['#\b('.$MON.')\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b#i', 'MonDY'],
    ];
    foreach ($patterns as [$pat, $type]) {
        if (preg_match($pat, $haystack, $m)) {
            $d = toISO($m, $type, $monthMap);
            if ($d) return $d;
        }
    }
    return null;
}

// ════════════════════════════════════════════════════════════════════════
//  1. URL
// ════════════════════════════════════════════════════════════════════════
$link = '';
if (preg_match('#(https?://[^\s\)\]"\'<>]+)#i', $flat, $m)) {
    $link = rtrim($m[1], '.,;:');
}

// ════════════════════════════════════════════════════════════════════════
//  1b. BARE-URL MODE — fetch page & augment text with title + description
//      Triggered when the entire input is essentially just a URL.
// ════════════════════════════════════════════════════════════════════════
$pageTitle = '';
$pageDesc  = '';
$isBareUrl = $link !== '' && preg_match('#^https?://\S+$#i', trim($raw));

if ($link !== '') {
    // Fetch via cURL (5 s timeout, follow redirects, desktop UA)
    $ch = curl_init($link);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => 7,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
        CURLOPT_HTTPHEADER     => ['Accept-Language: en-US,en;q=0.9'],
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $html = curl_exec($ch);
    curl_close($ch);

    if ($html && strlen($html) > 100) {
        // Extract <title>
        if (preg_match('#<title[^>]*>\s*(.*?)\s*</title>#is', $html, $tm)) {
            $pageTitle = html_entity_decode(trim($tm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $pageTitle = preg_replace('/\s+/', ' ', $pageTitle);
        }
        // Extract meta description
        if (preg_match('#<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $dm) ||
            preg_match('#<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']#i', $html, $dm)) {
            $pageDesc = html_entity_decode(trim($dm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        // Extract OG title as second option
        if ($pageTitle === '') {
            if (preg_match('#<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']#i', $html, $ogm)) {
                $pageTitle = html_entity_decode(trim($ogm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }
    }

    // Augment the working text with fetched content so downstream patterns can use it
    if ($pageTitle !== '') {
        $flat  = $pageTitle . ' . ' . $pageDesc . ' . ' . $flat;
        $clean = $pageTitle . "\n" . $pageDesc . "\n" . $clean;
    }
}

// ════════════════════════════════════════════════════════════════════════
//  1c. SITE-SPECIFIC TITLE PARSERS
//      Parse company + role directly from the page <title> for known sites.
//      These run early so they can be overridden by labelled fields later.
// ════════════════════════════════════════════════════════════════════════
$titleCompany = '';
$titleRole    = '';

if ($pageTitle !== '') {
    $host = strtolower(parse_url($link, PHP_URL_HOST) ?? '');

    // LinkedIn: "Senior Engineer at Google | LinkedIn"
    //           "Senior Engineer at Google (Remote) | LinkedIn"
    if (str_contains($host, 'linkedin')) {
        if (preg_match('/^(.+?)\s+at\s+(.+?)(?:\s*[\(\|]|\s*$)/i', $pageTitle, $lm)) {
            $titleRole    = trim($lm[1]);
            $titleCompany = trim($lm[2]);
        }
    }
    // Internshala: "Role Internship [in City] at Company | Internshala"
    elseif (str_contains($host, 'internshala')) {
        if (preg_match('/^(.+?)\s+at\s+(.+?)\s*[\|–]/i', $pageTitle, $im)) {
            $titleRole    = trim($im[1]);
            $titleCompany = trim($im[2]);
        } elseif (preg_match('/^(.+?)\s+[\|–]/i', $pageTitle, $im)) {
            $titleRole = trim($im[1]);
        }
    }
    // Unstop: "Opportunity Title by Company | Unstop"
    //         "Opportunity Title | Company | Unstop"
    elseif (str_contains($host, 'unstop') || str_contains($host, 'd2l')) {
        if (preg_match('/^(.+?)\s+by\s+(.+?)\s*[\|–]/i', $pageTitle, $um)) {
            $titleRole    = trim($um[1]);
            $titleCompany = trim($um[2]);
        } elseif (preg_match('/^(.+?)\s*\|\s*(.+?)\s*\|/i', $pageTitle, $um)) {
            $titleRole    = trim($um[1]);
            $titleCompany = trim($um[2]);
        }
    }
    // Indeed: "Job Title - Company - Location | Indeed.com"
    elseif (str_contains($host, 'indeed')) {
        if (preg_match('/^(.+?)\s*[-–]\s*(.+?)\s*[-–]/i', $pageTitle, $idm)) {
            $titleRole    = trim($idm[1]);
            $titleCompany = trim($idm[2]);
        }
    }
    // Naukri: "Company hiring Role" or "Role Jobs in Company"
    elseif (str_contains($host, 'naukri')) {
        if (preg_match('/^(.+?)\s+hiring\s+(.+?)(?:\s*[\|\(]|\s*$)/i', $pageTitle, $nm)) {
            $titleCompany = trim($nm[1]);
            $titleRole    = trim($nm[2]);
        } elseif (preg_match('/^(.+?)\s+Job[s]?\s+[\|\-–]/i', $pageTitle, $nm)) {
            $titleRole = trim($nm[1]);
        }
    }
    // Wellfound / AngelList: "Role at Company | Wellfound"
    elseif (str_contains($host, 'wellfound') || str_contains($host, 'angel.co')) {
        if (preg_match('/^(.+?)\s+at\s+(.+?)\s*[\|–]/i', $pageTitle, $wm)) {
            $titleRole    = trim($wm[1]);
            $titleCompany = trim($wm[2]);
        }
    }
    // Google Careers: "Role | Google Careers"
    elseif (str_contains($host, 'careers.google') || str_contains($host, 'google.com/careers')) {
        if (preg_match('/^(.+?)\s*[\|–]/i', $pageTitle, $gm)) {
            $titleRole    = trim($gm[1]);
            $titleCompany = 'Google';
        }
    }
    // Generic fallback: "Role at Company | Site"  OR  "Role - Company | Site"
    if ($titleRole === '') {
        if (preg_match('/^(.+?)\s+at\s+(.+?)(?:\s*[\|\(–]|\s*$)/i', $pageTitle, $gm)) {
            $titleRole    = trim($gm[1]);
            $titleCompany = trim($gm[2]);
        } elseif (preg_match('/^(.+?)\s*[-–]\s*(.+?)\s*[\|–]/i', $pageTitle, $gm)) {
            $titleRole    = trim($gm[1]);
            $titleCompany = trim($gm[2]);
        } elseif (preg_match('/^(.+?)\s*[\|–]/i', $pageTitle, $gm)) {
            $titleRole = trim($gm[1]);
        }
    }

    // Strip trailing noise from site-parsed values
    $titleRole    = trim(preg_replace('/\s*[\|–(].*/u', '', $titleRole));
    $titleCompany = trim(preg_replace('/\s*[\|–(].*/u', '', $titleCompany));
}

// ════════════════════════════════════════════════════════════════════════
//  2. SOURCE
// ════════════════════════════════════════════════════════════════════════
$source = 'Other';
if (preg_match('/\blinkedin\b/i', $flat))                               $source = 'LinkedIn';
elseif (preg_match('/\bwhatsapp\b/i', $flat))                           $source = 'WhatsApp';
elseif (preg_match('/\b(?:gmail|outlook|yahoo|mail|email)\b/i', $flat)) $source = 'Email';
elseif ($link) {
    $host = strtolower(parse_url($link, PHP_URL_HOST) ?? '');
    if (str_contains($host, 'linkedin'))                                 $source = 'LinkedIn';
    elseif (str_contains($host, 'gmail') || str_contains($host, 'mail'))$source = 'Email';
}

// ════════════════════════════════════════════════════════════════════════
//  3. DEADLINE — context-aware first, then any-date fallback
// ════════════════════════════════════════════════════════════════════════
$deadline = null;

$deadlineTrigger =
    '(?:last\s+date(?:\s+to\s+apply)?|apply\s+by|deadline|closing\s+date|' .
    'applications?\s+close[sd]?|submission\s+deadline|register\s+by|hiring\s+till|' .
    'registration\s+(?:deadline|closes?)|due\s+(?:date|by)|' .
    'last\s+day(?:\s+to\s+apply)?|apply\s+before|ends?\s+on|' .
    'closes?\s+on|open\s+till|valid\s+till|valid\s+until|until|' .
    'internship\s+ends?|internship\s+closes?|final\s+date)\s*[:\-\xe2\x80\x93]?\s*';

// First: Line-by-line search for deadline triggers
foreach (explode("\n", $clean) as $line) {
    if (preg_match('/' . $deadlineTrigger . '/i', $line)) {
        $d = extractFirstDate($line, $monthMap);
        if ($d) { $deadline = $d; break; }
    }
}

// Second: Search in flat text for deadline trigger + date within 80 chars
if (!$deadline) {
    if (preg_match('/' . $deadlineTrigger . '(.{0,120})/i', $flat, $m)) {
        $deadline = extractFirstDate($m[0], $monthMap);
    }
}

// Third: Search for common job board deadline patterns
if (!$deadline) {
    // Look for date near keywords like "till", "by", "on" without being too strict
    if (preg_match('/(?:till|by|on)\s+([A-Za-z0-9\s,\-\.\/]+?)(?:\s+(?:2024|2025|2026)|[\.\,\n])/i', $flat, $m)) {
        $deadline = extractFirstDate($m[1], $monthMap);
    }
}

// Fourth: Fallback to first date found in entire text
if (!$deadline) {
    $deadline = extractFirstDate($flat, $monthMap);
}

// ════════════════════════════════════════════════════════════════════════
//  4. ROLE — labelled fields first, then pattern matching
// ════════════════════════════════════════════════════════════════════════
$role = '';

// 4a. Labelled field
$roleLabel = '(?:role|position|profile|opening|vacancy|designation|job\s+title|post)\s*[:\-\xe2\x80\x93]\s*';
foreach (explode("\n", $clean) as $line) {
    if (preg_match('/' . $roleLabel . '(.+)/i', $line, $m)) {
        $candidate = trim(preg_replace('/[*_~]+/', '', $m[1]));
        if (strlen($candidate) >= 3 && strlen($candidate) <= 100) {
            $role = $candidate; break;
        }
    }
}

// 4b. "hiring [a] Role"
if ($role === '') {
    if (preg_match('/\bhiring\s+(?:a\s+|an\s+|for\s+)?([A-Za-z][^\n\.,!?]{3,70})/i', $flat, $m))
        $role = trim($m[1]);
}

// 4c. "looking for [a] Role"
if ($role === '') {
    if (preg_match('/\blooking\s+for\s+(?:a\s+|an\s+)?([A-Za-z][^\n\.,!?]{3,70})/i', $flat, $m))
        $role = trim($m[1]);
}

// 4d. "position of ..."
if ($role === '') {
    if (preg_match('/\bposition\s+of\s+([A-Za-z][^\n\.,!?]{3,70})/i', $flat, $m))
        $role = trim($m[1]);
}

// 4e. "apply for / applications for Role"
if ($role === '') {
    if (preg_match('/\b(?:apply|applications?)\s+(?:for\s+)?(?:the\s+)?(?:post\s+of\s+|role\s+of\s+|position\s+of\s+)?([A-Z][^\n\.,!?]{3,70})/i', $flat, $m))
        $role = trim($m[1]);
}

// 4f. Title-case line ending with known role keyword
if ($role === '') {
    $roleKW = 'Intern|Internship|Engineer|Developer|Analyst|Designer|Architect|Researcher|' .
              'Scientist|Consultant|Manager|Associate|Trainee|Fellow|Scholar|Executive|' .
              'Officer|Specialist|Lead|Coordinator|Strategist|Programmer|Tester|Writer|' .
              'Marketing|Finance|Operations|HR|Sales';
    foreach (explode("\n", $clean) as $line) {
        $line = trim(preg_replace('/^[\x{1F300}-\x{1FFFF}\x{2600}-\x{27FF}*\xE2\x80\xa2\-\xe2\x80\x93>]+\s*/u', '', $line));
        if (preg_match('/^([A-Z][A-Za-z0-9\s\/\(\)]{3,80})\s*$/u', $line, $m)) {
            if (preg_match('/\b(' . $roleKW . ')\b/i', $m[1])) {
                $role = trim($m[1]); break;
            }
        }
    }
}

// 4g. "Role at Company" structure
if ($role === '') {
    if (preg_match('/([A-Z][A-Za-z\s]{3,60})\s+at\s+[A-Z]/m', $clean, $m)) {
        $candidate = trim($m[1]);
        if (preg_match('/\b(?:Intern|Engineer|Developer|Analyst|Designer|Researcher|Scientist|Manager|Associate|Trainee|Fellow|Scholar|Executive)\b/i', $candidate))
            $role = $candidate;
    }
}

// 4h. Page-title fallback (when a bare URL was pasted)
if ($role === '' && $titleRole !== '') $role = $titleRole;

$role = trim(preg_replace('/[*_~.!,;:\-\xe2\x80\x93]+$/', '', $role));

// ════════════════════════════════════════════════════════════════════════
//  5. COMPANY — labelled fields first, then indicator words
// ════════════════════════════════════════════════════════════════════════
$company = '';

// 5a. Labelled field
$companyLabel = '(?:company|organisation|organization|employer|organis[se]r|organiz[se]r|institute|institution|client|by)\s*[:\-\xe2\x80\x93]\s*';
foreach (explode("\n", $clean) as $line) {
    if (preg_match('/' . $companyLabel . '(.+)/i', $line, $m)) {
        $candidate = trim(preg_replace('/[*_~]+/', '', $m[1]));
        if (strlen($candidate) >= 2 && strlen($candidate) <= 100) {
            $company = $candidate; break;
        }
    }
}

// 5b. Indicator words before CompanyName
if ($company === '') {
    $triggers = 'at|by|with|from|join|presented\s+by|hosted\s+by|organised\s+by|' .
                'organized\s+by|powered\s+by|sponsored\s+by|conducted\s+by|offered\s+by|' .
                'in\s+association\s+with';
    if (preg_match('/(?:' . $triggers . ')\s+([A-Z][A-Za-z0-9\s\.\-&\']{1,60}?)(?:\s+(?:is|has|are|invites|presents|announces|seeks)|[,\.\n!?]|$)/m', $clean, $m)) {
        $candidate = trim($m[1]);
        if (strlen($candidate) >= 2 && strlen($candidate) <= 80) $company = $candidate;
    }
}

// 5c. "CompanyName is hiring / announces / invites applications"
if ($company === '') {
    $verbs = 'is\s+hiring|are\s+hiring|is\s+looking|announces?|invites?\s+applications|' .
             'is\s+offering|presents?|is\s+accepting|is\s+recruiting|has\s+opened';
    if (preg_match('/([A-Z][A-Za-z0-9\s\.\-&]{1,50}?)\s+(?:' . $verbs . ')/m', $clean, $m)) {
        $candidate = trim($m[1]);
        if (strlen($candidate) >= 2 && strlen($candidate) <= 80) $company = $candidate;
    }
}

// 5d. "Role at Company"
if ($company === '' && $role !== '') {
    $escapedRole = preg_quote(substr($role, 0, 20), '/');
    if (preg_match('/' . $escapedRole . '.{0,30}\bat\s+([A-Z][A-Za-z0-9\s\.\-&]{1,60}?)(?:[,\.\n!?]|$)/i', $clean, $m))
        $company = trim($m[1]);
}

// 5e. URL domain fallback
if ($company === '' && $link) {
    $host  = parse_url($link, PHP_URL_HOST) ?? '';
    $host  = preg_replace('/^www\./', '', $host);
    $parts = explode('.', $host);
    $slug  = $parts[0] ?? '';
    $skip  = ['bit','forms','docs','drive','tinyurl','apply','careers','jobs','t','lnkd','ow','ly'];
    if (!in_array($slug, $skip) && strlen($slug) > 2) $company = ucfirst($slug);
}

// 5f. Page-title fallback (from cURL fetch of the pasted URL)
if ($company === '' && $titleCompany !== '') $company = $titleCompany;
if ($role    === '' && $titleRole    !== '') $role    = $titleRole;

// If text patterns found something but title found better ones for the other field, fill in the gap
if ($company === '' && $titleCompany !== '') $company = $titleCompany;
if ($role    === '' && $titleRole    !== '') $role    = $titleRole;

$company = trim(preg_replace('/[*_~.!,;:\-\xe2\x80\x93]+$/', '', $company));
$role    = trim(preg_replace('/[*_~.!,;:\-\xe2\x80\x93]+$/', '', $role));

// ════════════════════════════════════════════════════════════════════════
//  6. Return
// ════════════════════════════════════════════════════════════════════════
json_response([
    'success' => true,
    'data'    => [
        'company'  => $company,
        'role'     => $role,
        'deadline' => $deadline,
        'link'     => $link,
        'source'   => $source,
    ],
]);
