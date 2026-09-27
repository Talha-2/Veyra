# Development image for the Veyra app layer.
#
# Deliberately thin. Z360's production image (Ubuntu 24.04 + PHP 8.4 from the
# ondrej PPA + Node + postgres-client + markitdown) is the better *production*
# target and should be adopted when this ships — but building it pulls dozens of
# apt/PPA packages inside the build, and on the network this repo is developed
# against those transfers truncate (see the composer failure that produced
# `curl error 56` on the first scaffold). Docker Hub layers resume; apt inside a
# build does not.
#
# So: official base, one apt package, one extension. Everything else that image
# provides is either already handled (Node runs on the host) or not needed until
# the phase that introduces it.

FROM php:8.4-cli

# libpq-dev is the only build dependency pdo_pgsql needs. `docker-php-ext-install`
# compiles against it; the runtime lib comes along with it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev \
    && docker-php-ext-install pdo_pgsql opcache \
    && apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/*

# opcache is doing the heavy lifting here — see the comments in php.ini.
COPY docker/php.ini /usr/local/etc/php/conf.d/99-app.ini

# Per-session ini overrides from the environment (OPCACHE_VALIDATE_TIMESTAMPS).
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

WORKDIR /app

# PHP's built-in server is single-threaded, and a browser opens several parallel
# connections per page. Chrome's pre-opened sockets then sit at the head of the
# queue and every request behind them stalls — measured at 9-12 seconds per
# request here, while the same URL fetched by a single-connection client
# returned in 0.01s. Forking workers removes the head-of-line blocking.
ENV PHP_CLI_SERVER_WORKERS=8

# artisan serve, not php-fpm + nginx: this image exists to run one developer's
# app on one machine. Production gets the real stack.
#
# --no-reload is required for PHP_CLI_SERVER_WORKERS to take effect; Laravel
# refuses to fork while it is also watching .env for changes. The trade is that
# editing .env needs `docker compose restart app`. PHP source changes are picked
# up as normal — only the env watcher is gone.
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000", "--no-reload"]
