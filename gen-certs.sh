#/usr/bin/sh
mkdir -p ssl
openssl genrsa 2048 > ssl/localhost.key
openssl req -new -x509 -nodes -sha256 -days 365 -key ssl/localhost.key -out ssl/localhost.pem
