# TestFlow Database

База подготовлена так, чтобы проект можно было перенести на обычный хостинг с MySQL, а локально быстро поднять на SQLite.

## Файлы

- `mysql/schema.sql` - основная схема для хостинга с MySQL 8+.
- `sqlite/schema.sql` - почти такая же схема для локальной разработки или маленького VPS.

## Основные сущности

- `users` - пользователи для авторизации.
- `qa_groups` - группы пользователей, кейсов и сьютов.
- `test_cases` - кейсы.
- `test_case_steps` - строки/шаги кейса: предусловие, шаги, ОР, ФР, комментарии, статус.
- `suites` - сьюты.
- `user_groups`, `test_case_groups`, `suite_groups`, `suite_cases` - связи многие-ко-многим.

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
3. Импортируйте `database/mysql/schema.sql`.
4. Загрузите проект на хостинг с PHP PDO MySQL.

Frontend сначала пытается работать с API, а если API недоступен, использует `localStorage`.
