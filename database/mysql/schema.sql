CREATE TABLE users (
  id VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(80) NOT NULL DEFAULT 'Tester',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE qa_groups (
  id VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY qa_groups_name_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_groups (
  user_id VARCHAR(40) NOT NULL,
  group_id VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_id),
  CONSTRAINT user_groups_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_groups_group_fk FOREIGN KEY (group_id) REFERENCES qa_groups (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE test_cases (
  id VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  owner_id VARCHAR(40) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY test_cases_owner_idx (owner_id),
  CONSTRAINT test_cases_owner_fk FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE test_case_steps (
  id VARCHAR(40) NOT NULL,
  test_case_id VARCHAR(40) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  precondition TEXT NULL,
  action TEXT NULL,
  expected_result TEXT NULL,
  actual_result TEXT NULL,
  comment TEXT NULL,
  result_status ENUM('untested', 'passed', 'failed') NOT NULL DEFAULT 'untested',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY test_case_steps_case_idx (test_case_id, sort_order),
  CONSTRAINT test_case_steps_case_fk FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE test_case_groups (
  test_case_id VARCHAR(40) NOT NULL,
  group_id VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_case_id, group_id),
  CONSTRAINT test_case_groups_case_fk FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE,
  CONSTRAINT test_case_groups_group_fk FOREIGN KEY (group_id) REFERENCES qa_groups (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE test_case_assignees (
  test_case_id VARCHAR(40) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_case_id, user_id),
  CONSTRAINT test_case_assignees_case_fk FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE,
  CONSTRAINT test_case_assignees_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suites (
  id VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suite_groups (
  suite_id VARCHAR(40) NOT NULL,
  group_id VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (suite_id, group_id),
  CONSTRAINT suite_groups_suite_fk FOREIGN KEY (suite_id) REFERENCES suites (id) ON DELETE CASCADE,
  CONSTRAINT suite_groups_group_fk FOREIGN KEY (group_id) REFERENCES qa_groups (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suite_cases (
  suite_id VARCHAR(40) NOT NULL,
  test_case_id VARCHAR(40) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (suite_id, test_case_id),
  KEY suite_cases_case_idx (test_case_id),
  CONSTRAINT suite_cases_suite_fk FOREIGN KEY (suite_id) REFERENCES suites (id) ON DELETE CASCADE,
  CONSTRAINT suite_cases_case_fk FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_sessions (
  id CHAR(64) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY auth_sessions_user_idx (user_id),
  KEY auth_sessions_expires_idx (expires_at),
  CONSTRAINT auth_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
