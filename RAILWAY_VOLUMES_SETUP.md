# Настройка Railway Volumes для постоянного хранения файлов

## Проблема
При каждом деплое на Railway все файлы в папке `uploads` удаляются, так как Railway использует эфемерную файловую систему.

## Решение
Использование Railway Volumes для постоянного хранения файлов.

## Шаги настройки

### 1. Создание Volume в Railway Dashboard
1. Откройте проект в Railway Dashboard
2. Перейдите в раздел "Volumes"
3. Нажмите "New Volume"
4. Настройте:
   - **Name**: `logos-backend-volume` (или любое другое имя)
   - **Mount Path**: `/app/uploads`
   - **Size**: `1GB` (или больше при необходимости)

### 2. Обновление конфигурации
Файл `railway.json` уже создан с правильной конфигурацией:
```json
{
  "volumes": [
    {
      "name": "logos-backend-volume",
      "mountPath": "/app/uploads",
      "size": "1GB"
    }
  ]
}
```

### 3. Обновленные пути в коде
Все пути к файлам обновлены для использования Railway volume:
- Аватары: `/app/uploads/companies/{company}/avatars/`
- Отчеты: `/app/uploads/companies/{company}/reports/`
- Файлы: `/app/uploads/companies/{company}/files/`
- Аудио: `/app/uploads/companies/{company}/calls/`

### 4. Деплой
После настройки Volume выполните деплой:
```bash
railway up
```

## Проверка работы
1. Загрузите аватар или файл
2. Выполните деплой
3. Проверьте, что файлы остались доступными

## Важные замечания
- Volume должен быть создан **до** первого деплоя с новой конфигурацией
- Размер Volume можно увеличить позже, но нельзя уменьшить
- Файлы в Volume сохраняются между деплоями
- При удалении Volume все файлы будут потеряны
- Имя Volume может отличаться от пути монтирования (например, `logos-backend-volume` с путем `/app/uploads`)

## Альтернативное решение
Если Railway Volumes недоступны, можно использовать облачное хранилище (AWS S3, Cloudinary, Yandex.Cloud).
