ARG BASE_IMAGE
FROM ${BASE_IMAGE}

# Refresh supported Alpine packages and remove the bundled Go-based gosu
# helper. Compose starts this image as postgres, so the entrypoint never needs
# to cross a privilege boundary and the helper's Go stdlib is not shipped.
USER root
RUN apk add --no-cache --upgrade \
        "libcrypto3=3.5.8-r0" \
        "libssl3=3.5.8-r0" \
    && rm -f /usr/local/bin/gosu
USER postgres
