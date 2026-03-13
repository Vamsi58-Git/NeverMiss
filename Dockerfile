FROM node:20-alpine AS frontend-build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM php:8.2-apache

# Install PHP MySQL PDO extension for API database access.
RUN docker-php-ext-install pdo pdo_mysql && a2enmod rewrite

WORKDIR /var/www/html

# Serve built frontend from Apache root.
COPY --from=frontend-build /app/dist/ ./

# Copy PHP API and schema for reference/import.
COPY --from=frontend-build /app/api ./api
COPY --from=frontend-build /app/database/schema.sql ./schema.sql

# Apache virtual host config and SPA fallback rules.
COPY .render/apache-vhost.conf /etc/apache2/sites-available/000-default.conf
COPY .render/.htaccess /var/www/html/.htaccess

EXPOSE 80
