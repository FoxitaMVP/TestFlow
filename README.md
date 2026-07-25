# TestFlow

## Docker

Скопируйте пример переменных окружения:

```bash
cp .env.example .env
```

Запустите приложение и MySQL:

```bash
docker compose up --build
```

После старта откройте:

```text
http://127.0.0.1:8080
```

Порт можно поменять в `.env` через `APP_PORT`.

MySQL схема импортируется автоматически при первом создании volume `db_data` из `database/mysql/schema.sql`.

Если нужно пересоздать базу с нуля:

```bash
docker compose down -v
docker compose up --build
```
