PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Tester',
  status TEXT NOT NULL DEFAULT 'approved',
  requested_at INTEGER,
  active_session_token TEXT,
  last_activity_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE qa_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_groups (
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES qa_groups (id) ON DELETE CASCADE
);

CREATE TABLE test_cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  owner_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX test_cases_owner_idx ON test_cases (owner_id);

CREATE TABLE test_case_steps (
  id TEXT PRIMARY KEY,
  test_case_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  precondition TEXT,
  action TEXT,
  expected_result TEXT,
  actual_result TEXT,
  comment TEXT,
  result_status TEXT NOT NULL DEFAULT 'untested' CHECK (result_status IN ('untested', 'passed', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE
);

CREATE INDEX test_case_steps_case_idx ON test_case_steps (test_case_id, sort_order);

CREATE TABLE test_case_groups (
  test_case_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_case_id, group_id),
  FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES qa_groups (id) ON DELETE CASCADE
);

CREATE TABLE test_case_assignees (
  test_case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_case_id, user_id),
  FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE suites (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE suite_groups (
  suite_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (suite_id, group_id),
  FOREIGN KEY (suite_id) REFERENCES suites (id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES qa_groups (id) ON DELETE CASCADE
);

CREATE TABLE suite_cases (
  suite_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (suite_id, test_case_id),
  FOREIGN KEY (suite_id) REFERENCES suites (id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_id) REFERENCES test_cases (id) ON DELETE CASCADE
);

CREATE INDEX suite_cases_case_idx ON suite_cases (test_case_id);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions (expires_at);
