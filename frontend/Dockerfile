FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js discogs.js listening.js covers.js sync.js styles.css /usr/share/nginx/html/
EXPOSE 80
