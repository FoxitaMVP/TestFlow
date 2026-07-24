# TestFlow Database

База подготовлена так, чтобы проект можно было перенести на обычный хостинг с MySQL, а локально быстро поднять на SQLite.

## Файлы

- `mysql/schema.sql` - основная схема для хостинга с MySQL 8+.
- `sqlite/schema.sql` - почти такая же схема для локальной разработки или маленького VPS.

## Основные сущности

- `users` - пользователи для авторизации, роль, статус одобрения, дата заявки и текущий session token.
- `users.password_reset_token`, `users.password_reset_expires_at` - временная ссылка восстановления пароля.
- `qa_groups` - группы пользователей, кейсов и сьютов.
- `test_cases` - кейсы.
- `test_case_assignees` - назначенные QA для работы с кейсами.
- `test_case_steps` - строки/шаги кейса: предусловие, шаги, ОР, ФР, комментарии, статус.
- `suites` - сьюты.
- `user_groups`, `test_case_groups`, `test_case_assignees`, `suite_groups`, `suite_cases` - связи многие-ко-многим.

## MySQL

```bash
mysql -u USER -p DATABASE_NAME < database/mysql/schema.sql
```

Для паролей храните не исходный пароль, а hash. Например, на backend используйте `password_hash()` в PHP или `bcrypt/argon2` в Node.js.

## SQLite

```bash
sqlite3 testflow.db < database/sqlite/schema.sql
```

SQLite удобен для локальной проверки API, но для shared-хостинга чаще проще использовать MySQL.

## Следующий шаг

## API

Добавлен PHP API:

- `api/config.example.php` - пример настроек подключения.
- `api/index.php?action=state` - `GET` отдает состояние приложения, `POST` сохраняет состояние в БД.

Для хостинга:

1. Скопируйте `api/config.example.php` в `api/config.php`.
2. Укажите доступы MySQL.
3. Укажите `app_url` и SMTP в блоке `mail`, чтобы работало восстановление пароля.
4. Импортируйте `database/mysql/schema.sql`.
5. Загрузите проект на хостинг с PHP PDO MySQL.

Если база уже создана, добавьте поля восстановления пароля:

```sql
ALTER TABLE users
  ADD COLUMN password_reset_token VARCHAR(128) NULL,
  ADD COLUMN password_reset_expires_at BIGINT NULL;

CREATE INDEX users_password_reset_token_idx
  ON users (password_reset_token);
```

Frontend сначала пытается работать с API, а если API недоступен, использует `localStorage`.
