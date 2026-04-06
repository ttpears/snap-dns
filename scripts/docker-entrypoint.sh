#!/bin/sh
# Replace API URL placeholder with runtime environment variable
if [ -n "$REACT_APP_API_URL" ]; then
  find /app/build -name '*.js' -exec sed -i "s|__REACT_APP_API_URL_PLACEHOLDER__|$REACT_APP_API_URL|g" {} +
fi

exec "$@"
