<?php

$env = static function (string $name, string $default): string {
    $value = getenv($name);
    return $value === false ? $default : $value;
};

return [
    // mysql: host, dbname, user, password
    // sqlite: path
    'driver' => $env('TESTFLOW_DB_DRIVER', 'mysql'),
    'mysql' => [
        'host' => $env('TESTFLOW_DB_HOST', '127.0.0.1'),
        'port' => $env('TESTFLOW_DB_PORT', '3306'),
        'dbname' => $env('TESTFLOW_DB_NAME', 'testflow'),
        'user' => $env('TESTFLOW_DB_USER', 'testflow_user'),
        'password' => $env('TESTFLOW_DB_PASSWORD', 'change-me'),
        'charset' => $env('TESTFLOW_DB_CHARSET', 'utf8mb4'),
    ],
    'sqlite' => [
        'path' => $env('TESTFLOW_SQLITE_PATH', __DIR__ . '/../database/testflow.db'),
    ],
];
