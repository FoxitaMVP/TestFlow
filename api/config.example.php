<?php

return [
    // mysql: host, dbname, user, password
    // sqlite: path
    'driver' => 'mysql',
    'app_url' => 'https://example.com',
    'mysql' => [
        'host' => '127.0.0.1',
        'dbname' => 'testflow',
        'user' => 'testflow_user',
        'password' => 'change-me',
        'charset' => 'utf8mb4',
    ],
    'sqlite' => [
        'path' => __DIR__ . '/../database/testflow.db',
    ],
    'mail' => [
        'from_email' => 'no-reply@example.com',
        'from_name' => 'TestFlow QA',
        'smtp' => [
            'host' => 'smtp.example.com',
            'port' => 465,
            'username' => 'no-reply@example.com',
            'password' => 'change-me',
        ],
    ],
];
