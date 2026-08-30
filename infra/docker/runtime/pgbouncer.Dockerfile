ARG BASE_IMAGE
FROM ${BASE_IMAGE}

# PgBouncer's upstream image is already non-root. Temporarily elevate only for
# package maintenance, then restore the publisher's postgres runtime identity.
USER root
RUN apk add --no-cache --upgrade \
    "libcrypto3=3.5.8-r0" \
    "libpq=18.6-r0" \
    "libssl3=3.5.8-r0" \
    "postgresql18-client=18.6-r0"
USER postgres
