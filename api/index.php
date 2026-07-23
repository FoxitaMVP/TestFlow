<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$configFile = __DIR__ . '/config.php';
$config = file_exists($configFile)
    ? require $configFile
    : require __DIR__ . '/config.example.php';

try {
    $pdo = connectDatabase($config);
    $action = $_GET['action'] ?? 'state';

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'state') {
        respond(loadState($pdo));
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'state') {
        $payload = json_decode(file_get_contents('php://input'), true, flags: JSON_THROW_ON_ERROR);
        saveState($pdo, $payload);
        respond(['ok' => true]);
    }

    http_response_code(404);
    respond(['error' => 'Unknown API endpoint']);
} catch (Throwable $error) {
    http_response_code(500);
    respond(['error' => $error->getMessage()]);
}

function connectDatabase(array $config): PDO
{
    if (($config['driver'] ?? 'mysql') === 'sqlite') {
        $pdo = new PDO('sqlite:' . $config['sqlite']['path']);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    }

    $mysql = $config['mysql'];
    $charset = $mysql['charset'] ?? 'utf8mb4';
    $dsn = "mysql:host={$mysql['host']};dbname={$mysql['dbname']};charset={$charset}";
    $pdo = new PDO($dsn, $mysql['user'], $mysql['password']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

function respond(array $payload): void
{
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function loadState(PDO $pdo): array
{
    $users = fetchUsers($pdo);
    $groups = fetchGroups($pdo);
    $cases = fetchCases($pdo);
    $suites = fetchSuites($pdo);

    return [
        'currentUserId' => $users[0]['id'] ?? null,
        'users' => $users,
        'groups' => $groups,
        'cases' => $cases,
        'suites' => $suites,
    ];
}

function fetchUsers(PDO $pdo): array
{
    $users = $pdo->query('SELECT id, name, email, password_hash, role FROM users ORDER BY created_at, id')->fetchAll();
    $groupMap = fetchRelationMap($pdo, 'SELECT user_id AS item_id, group_id FROM user_groups');

    return array_map(fn ($user) => [
        'id' => $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'password' => $user['password_hash'],
        'role' => $user['role'],
        'groupIds' => $groupMap[$user['id']] ?? [],
    ], $users);
}

function fetchGroups(PDO $pdo): array
{
    return $pdo->query('SELECT id, name, description FROM qa_groups ORDER BY created_at, id')->fetchAll();
}

function fetchCases(PDO $pdo): array
{
    $cases = $pdo->query('SELECT id, title, description, owner_id FROM test_cases ORDER BY created_at, id')->fetchAll();
    $groupMap = fetchRelationMap($pdo, 'SELECT test_case_id AS item_id, group_id FROM test_case_groups');
    $stepsByCase = [];
    $steps = $pdo->query(
        'SELECT id, test_case_id, precondition, action, expected_result, actual_result, comment, result_status
         FROM test_case_steps
         ORDER BY test_case_id, sort_order, id'
    )->fetchAll();

    foreach ($steps as $step) {
        $stepsByCase[$step['test_case_id']][] = [
            'id' => $step['id'],
            'precondition' => $step['precondition'] ?? '',
            'action' => $step['action'] ?? '',
            'expected' => $step['expected_result'] ?? '',
            'actual' => $step['actual_result'] ?? '',
            'comment' => $step['comment'] ?? '',
            'status' => $step['result_status'],
        ];
    }

    return array_map(fn ($case) => [
        'id' => $case['id'],
        'title' => $case['title'],
        'description' => $case['description'] ?? '',
        'ownerId' => $case['owner_id'],
        'groupIds' => $groupMap[$case['id']] ?? [],
        'steps' => $stepsByCase[$case['id']] ?? [],
    ], $cases);
}

function fetchSuites(PDO $pdo): array
{
    $suites = $pdo->query('SELECT id, title, description FROM suites ORDER BY created_at, id')->fetchAll();
    $groupMap = fetchRelationMap($pdo, 'SELECT suite_id AS item_id, group_id FROM suite_groups');
    $caseMap = fetchRelationMap($pdo, 'SELECT suite_id AS item_id, test_case_id AS group_id FROM suite_cases ORDER BY suite_id, sort_order');

    return array_map(fn ($suite) => [
        'id' => $suite['id'],
        'title' => $suite['title'],
        'description' => $suite['description'] ?? '',
        'groupIds' => $groupMap[$suite['id']] ?? [],
        'caseIds' => $caseMap[$suite['id']] ?? [],
    ], $suites);
}

function fetchRelationMap(PDO $pdo, string $query): array
{
    $map = [];
    foreach ($pdo->query($query)->fetchAll() as $row) {
        $map[$row['item_id']][] = $row['group_id'];
    }
    return $map;
}

function saveState(PDO $pdo, array $state): void
{
    $pdo->beginTransaction();

    try {
        clearState($pdo);
        saveGroups($pdo, $state['groups'] ?? []);
        saveUsers($pdo, $state['users'] ?? []);
        saveCases($pdo, $state['cases'] ?? []);
        saveSuites($pdo, $state['suites'] ?? []);
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }
}

function clearState(PDO $pdo): void
{
    foreach (['auth_sessions', 'suite_cases', 'suite_groups', 'test_case_groups', 'test_case_steps', 'suites', 'test_cases', 'user_groups', 'users', 'qa_groups'] as $table) {
        $pdo->exec("DELETE FROM {$table}");
    }
}

function saveGroups(PDO $pdo, array $groups): void
{
    $stmt = $pdo->prepare('INSERT INTO qa_groups (id, name, description) VALUES (?, ?, ?)');
    foreach ($groups as $group) {
        $stmt->execute([$group['id'], $group['name'], $group['description'] ?? null]);
    }
}

function saveUsers(PDO $pdo, array $users): void
{
    $stmt = $pdo->prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)');
    $link = $pdo->prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)');

    foreach ($users as $user) {
        $stmt->execute([$user['id'], $user['name'], $user['email'], $user['password'] ?? '', $user['role'] ?? 'Tester']);
        foreach ($user['groupIds'] ?? [] as $groupId) {
            $link->execute([$user['id'], $groupId]);
        }
    }
}

function saveCases(PDO $pdo, array $cases): void
{
    $stmt = $pdo->prepare('INSERT INTO test_cases (id, title, description, owner_id) VALUES (?, ?, ?, ?)');
    $groupLink = $pdo->prepare('INSERT INTO test_case_groups (test_case_id, group_id) VALUES (?, ?)');
    $stepStmt = $pdo->prepare(
        'INSERT INTO test_case_steps
         (id, test_case_id, sort_order, precondition, action, expected_result, actual_result, comment, result_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    foreach ($cases as $case) {
        $stmt->execute([$case['id'], $case['title'], $case['description'] ?? null, $case['ownerId'] ?? null]);
        foreach ($case['groupIds'] ?? [] as $groupId) {
            $groupLink->execute([$case['id'], $groupId]);
        }
        foreach ($case['steps'] ?? [] as $index => $step) {
            $stepStmt->execute([
                $step['id'],
                $case['id'],
                $index,
                $step['precondition'] ?? null,
                $step['action'] ?? '',
                $step['expected'] ?? null,
                $step['actual'] ?? null,
                $step['comment'] ?? null,
                $step['status'] ?? 'untested',
            ]);
        }
    }
}

function saveSuites(PDO $pdo, array $suites): void
{
    $stmt = $pdo->prepare('INSERT INTO suites (id, title, description) VALUES (?, ?, ?)');
    $groupLink = $pdo->prepare('INSERT INTO suite_groups (suite_id, group_id) VALUES (?, ?)');
    $caseLink = $pdo->prepare('INSERT INTO suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)');

    foreach ($suites as $suite) {
        $stmt->execute([$suite['id'], $suite['title'], $suite['description'] ?? null]);
        foreach ($suite['groupIds'] ?? [] as $groupId) {
            $groupLink->execute([$suite['id'], $groupId]);
        }
        foreach ($suite['caseIds'] ?? [] as $index => $caseId) {
            $caseLink->execute([$suite['id'], $caseId, $index]);
        }
    }
}
