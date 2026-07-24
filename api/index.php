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

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'password-reset-request') {
        $payload = json_decode(file_get_contents('php://input'), true, flags: JSON_THROW_ON_ERROR);
        requestPasswordReset($pdo, $config, trim(strtolower((string) ($payload['email'] ?? ''))));
        respond(['ok' => true]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'password-reset-confirm') {
        $payload = json_decode(file_get_contents('php://input'), true, flags: JSON_THROW_ON_ERROR);
        confirmPasswordReset(
            $pdo,
            trim((string) ($payload['token'] ?? '')),
            (string) ($payload['password'] ?? '')
        );
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
        ensureSupplementalSchema($pdo, 'sqlite');
        return $pdo;
    }

    $mysql = $config['mysql'];
    $charset = $mysql['charset'] ?? 'utf8mb4';
    $dsn = "mysql:host={$mysql['host']};dbname={$mysql['dbname']};charset={$charset}";
    $pdo = new PDO($dsn, $mysql['user'], $mysql['password']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    ensureSupplementalSchema($pdo, 'mysql');
    return $pdo;
}

function ensureSupplementalSchema(PDO $pdo, string $driver): void
{
    if ($driver === 'sqlite') {
        addColumnIfMissing($pdo, 'sqlite', 'users', 'status', "TEXT NOT NULL DEFAULT 'approved'");
        addColumnIfMissing($pdo, 'sqlite', 'users', 'requested_at', 'INTEGER');
        addColumnIfMissing($pdo, 'sqlite', 'users', 'active_session_token', 'TEXT');
        addColumnIfMissing($pdo, 'sqlite', 'users', 'last_activity_at', 'INTEGER');
        addColumnIfMissing($pdo, 'sqlite', 'users', 'password_reset_token', 'TEXT');
        addColumnIfMissing($pdo, 'sqlite', 'users', 'password_reset_expires_at', 'INTEGER');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS test_case_assignees (
              test_case_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (test_case_id, user_id),
              FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )'
        );
        return;
    }

    addColumnIfMissing($pdo, 'mysql', 'users', 'status', "VARCHAR(24) NOT NULL DEFAULT 'approved'");
    addColumnIfMissing($pdo, 'mysql', 'users', 'requested_at', 'BIGINT NULL');
    addColumnIfMissing($pdo, 'mysql', 'users', 'active_session_token', 'VARCHAR(80) NULL');
    addColumnIfMissing($pdo, 'mysql', 'users', 'last_activity_at', 'BIGINT NULL');
    addColumnIfMissing($pdo, 'mysql', 'users', 'password_reset_token', 'VARCHAR(128) NULL');
    addColumnIfMissing($pdo, 'mysql', 'users', 'password_reset_expires_at', 'BIGINT NULL');
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS test_case_assignees (
          test_case_id VARCHAR(40) NOT NULL,
          user_id VARCHAR(40) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (test_case_id, user_id),
          CONSTRAINT test_case_assignees_case_fk FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE,
          CONSTRAINT test_case_assignees_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function addColumnIfMissing(PDO $pdo, string $driver, string $table, string $column, string $definition): void
{
    if ($driver === 'sqlite') {
        $columns = $pdo->query("PRAGMA table_info({$table})")->fetchAll();
        $exists = array_filter($columns, fn ($item) => $item['name'] === $column);
        if (!$exists) {
            $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
        }
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $stmt->execute([$table, $column]);
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
    }
}

function respond(array $payload): void
{
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function errorResponse(string $message, int $status = 400): void
{
    http_response_code($status);
    respond(['error' => $message]);
}

function loadState(PDO $pdo): array
{
    $users = fetchUsers($pdo);
    $groups = fetchGroups($pdo);
    $cases = fetchCases($pdo);
    $suites = fetchSuites($pdo);

    return [
        'currentUserId' => null,
        'users' => $users,
        'groups' => $groups,
        'cases' => $cases,
        'suites' => $suites,
    ];
}

function fetchUsers(PDO $pdo): array
{
    $users = $pdo->query('SELECT id, name, email, password_hash, role, status, requested_at, active_session_token, last_activity_at FROM users ORDER BY created_at, id')->fetchAll();
    $groupMap = fetchRelationMap($pdo, 'SELECT user_id AS item_id, group_id FROM user_groups');

    return array_map(fn ($user) => [
        'id' => $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'password' => $user['password_hash'],
        'role' => $user['role'],
        'status' => $user['status'] ?? 'approved',
        'requestedAt' => $user['requested_at'] ? (int) $user['requested_at'] : null,
        'activeSessionToken' => $user['active_session_token'],
        'lastActivityAt' => $user['last_activity_at'] ? (int) $user['last_activity_at'] : null,
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
    $assigneeMap = fetchRelationMap($pdo, 'SELECT test_case_id AS item_id, user_id AS group_id FROM test_case_assignees');
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
        'assignedUserIds' => $assigneeMap[$case['id']] ?? [],
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
    $state = normalizeStateReferences($state);
    $userServerFields = fetchUserServerFields($pdo);
    $pdo->beginTransaction();

    try {
        clearState($pdo);
        saveGroups($pdo, $state['groups'] ?? []);
        saveUsers($pdo, $state['users'] ?? [], $userServerFields);
        saveCases($pdo, $state['cases'] ?? []);
        saveSuites($pdo, $state['suites'] ?? []);
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }
}

function fetchUserServerFields(PDO $pdo): array
{
    $fields = [];
    $rows = $pdo->query('SELECT id, password_reset_token, password_reset_expires_at FROM users')->fetchAll();
    foreach ($rows as $row) {
        $fields[$row['id']] = [
            'password_reset_token' => $row['password_reset_token'] ?? null,
            'password_reset_expires_at' => $row['password_reset_expires_at'] ? (int) $row['password_reset_expires_at'] : null,
        ];
    }
    return $fields;
}

function normalizeStateReferences(array $state): array
{
    $userIds = array_column($state['users'] ?? [], 'id');
    if (!isset($state['cases']) || !is_array($state['cases'])) {
        return $state;
    }

    foreach ($state['cases'] as &$case) {
        if (!empty($case['ownerId']) && !in_array($case['ownerId'], $userIds, true)) {
            $case['ownerId'] = null;
        }

        $case['assignedUserIds'] = array_values(array_filter(
            $case['assignedUserIds'] ?? [],
            fn ($userId) => in_array($userId, $userIds, true)
        ));
    }
    unset($case);

    return $state;
}

function clearState(PDO $pdo): void
{
    foreach (['auth_sessions', 'suite_cases', 'suite_groups', 'test_case_assignees', 'test_case_groups', 'test_case_steps', 'suites', 'test_cases', 'user_groups', 'users', 'qa_groups'] as $table) {
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

function saveUsers(PDO $pdo, array $users, array $serverFields = []): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO users
         (id, name, email, password_hash, role, status, requested_at, active_session_token, last_activity_at, password_reset_token, password_reset_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $link = $pdo->prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)');

    foreach ($users as $user) {
        $serverUserFields = $serverFields[$user['id']] ?? [];
        $stmt->execute([
            $user['id'],
            $user['name'],
            $user['email'],
            $user['password'] ?? '',
            $user['role'] ?? 'Tester',
            $user['status'] ?? 'approved',
            $user['requestedAt'] ?? null,
            $user['activeSessionToken'] ?? null,
            $user['lastActivityAt'] ?? null,
            $serverUserFields['password_reset_token'] ?? null,
            $serverUserFields['password_reset_expires_at'] ?? null,
        ]);
        foreach ($user['groupIds'] ?? [] as $groupId) {
            $link->execute([$user['id'], $groupId]);
        }
    }
}

function requestPasswordReset(PDO $pdo, array $config, string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return;
    }

    $stmt = $pdo->prepare("SELECT id, email, status FROM users WHERE LOWER(email) = ? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user || ($user['status'] ?? 'approved') !== 'approved') {
        return;
    }

    $token = bin2hex(random_bytes(32));
    $expiresAt = (int) floor(microtime(true) * 1000) + (30 * 60 * 1000);
    $update = $pdo->prepare('UPDATE users SET password_reset_token = ?, password_reset_expires_at = ? WHERE id = ?');
    $update->execute([$token, $expiresAt, $user['id']]);

    sendPasswordResetEmail($config, $user['email'], buildResetUrl($config, $token));
}

function confirmPasswordReset(PDO $pdo, string $token, string $password): void
{
    if ($token === '' || strlen($password) < 6) {
        errorResponse('Ссылка восстановления недействительна или пароль слишком короткий.');
    }

    $stmt = $pdo->prepare('SELECT id, password_reset_expires_at FROM users WHERE password_reset_token = ? LIMIT 1');
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user || (int) $user['password_reset_expires_at'] < (int) floor(microtime(true) * 1000)) {
        errorResponse('Ссылка восстановления устарела. Запросите новую ссылку.');
    }

    $update = $pdo->prepare(
        'UPDATE users
         SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL,
             active_session_token = NULL, last_activity_at = NULL
         WHERE id = ?'
    );
    $update->execute([$password, $user['id']]);
}

function buildResetUrl(array $config, string $token): string
{
    $baseUrl = trim((string) ($config['app_url'] ?? ''));
    if ($baseUrl === '') {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        $baseDir = preg_replace('#/api$#', '', $scriptDir);
        $baseUrl = "{$scheme}://{$host}{$baseDir}";
    }

    return rtrim($baseUrl, '/') . '/?reset=' . rawurlencode($token);
}

function sendPasswordResetEmail(array $config, string $email, string $resetUrl): void
{
    $mail = $config['mail'] ?? [];
    $smtp = $mail['smtp'] ?? [];
    $host = (string) ($smtp['host'] ?? '');
    $port = (int) ($smtp['port'] ?? 465);
    $username = (string) ($smtp['username'] ?? '');
    $password = (string) ($smtp['password'] ?? '');
    $fromEmail = (string) ($mail['from_email'] ?? $username);
    $fromName = (string) ($mail['from_name'] ?? 'TestFlow QA');

    if ($host === '' || $username === '' || $password === '' || $fromEmail === '') {
        throw new RuntimeException('SMTP для восстановления пароля не настроен.');
    }

    $subject = 'Восстановление пароля TestFlow QA';
    $body = "Здравствуйте!\r\n\r\n"
        . "Для восстановления пароля откройте ссылку:\r\n{$resetUrl}\r\n\r\n"
        . "Ссылка действует 30 минут. Если вы не запрашивали восстановление, просто игнорируйте это письмо.\r\n";

    smtpSend($host, $port, $username, $password, $fromEmail, $fromName, $email, $subject, $body);
}

function smtpSend(string $host, int $port, string $username, string $password, string $fromEmail, string $fromName, string $toEmail, string $subject, string $body): void
{
    $socket = stream_socket_client("ssl://{$host}:{$port}", $errno, $errstr, 30);
    if (!$socket) {
        throw new RuntimeException("SMTP недоступен: {$errstr}");
    }

    try {
        smtpExpect($socket, [220]);
        smtpCommand($socket, 'EHLO ' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), [250]);
        smtpCommand($socket, 'AUTH LOGIN', [334]);
        smtpCommand($socket, base64_encode($username), [334]);
        smtpCommand($socket, base64_encode($password), [235]);
        smtpCommand($socket, 'MAIL FROM:<' . $fromEmail . '>', [250]);
        smtpCommand($socket, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
        smtpCommand($socket, 'DATA', [354]);

        $headers = [
            'From: ' . mimeHeader($fromName) . ' <' . $fromEmail . '>',
            'To: <' . $toEmail . '>',
            'Subject: ' . mimeHeader($subject),
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];
        $message = implode("\r\n", $headers) . "\r\n\r\n" . preg_replace('/^\./m', '..', $body);
        fwrite($socket, $message . "\r\n.\r\n");
        smtpExpect($socket, [250]);
        smtpCommand($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function smtpCommand($socket, string $command, array $expectedCodes): string
{
    fwrite($socket, $command . "\r\n");
    return smtpExpect($socket, $expectedCodes);
}

function smtpExpect($socket, array $expectedCodes): string
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (isset($line[3]) && $line[3] === ' ') {
            break;
        }
    }

    $code = (int) substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('SMTP ошибка: ' . trim($response));
    }

    return $response;
}

function mimeHeader(string $value): string
{
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function saveCases(PDO $pdo, array $cases): void
{
    $stmt = $pdo->prepare('INSERT INTO test_cases (id, title, description, owner_id) VALUES (?, ?, ?, ?)');
    $groupLink = $pdo->prepare('INSERT INTO test_case_groups (test_case_id, group_id) VALUES (?, ?)');
    $assigneeLink = $pdo->prepare('INSERT INTO test_case_assignees (test_case_id, user_id) VALUES (?, ?)');
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
        foreach ($case['assignedUserIds'] ?? [] as $userId) {
            $assigneeLink->execute([$case['id'], $userId]);
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
