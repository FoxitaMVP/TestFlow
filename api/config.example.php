<?php

return [
    // mysql: host, dbname, user, password
    // sqlite: path
    'driver' => 'mysql',
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
];
