FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js discogs.js listening.js covers.js sync.js personal.js wishlist.js capture.js discovery.js statistics.js labels.js settings.js appearance.js bulk.js qr.js streaming.js theme-init.js styles.css /usr/share/nginx/html/
COPY vendor /usr/share/nginx/html/vendor/
EXPOSE 80
