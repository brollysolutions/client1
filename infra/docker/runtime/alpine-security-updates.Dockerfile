ARG BASE_IMAGE
FROM ${BASE_IMAGE}

# The release-image build supplies a versioned, digest-pinned upstream image.
# Exact package versions make a later repository change fail closed instead of
# silently producing a different artifact under the same release tag.
USER root
RUN apk add --no-cache --upgrade \
    "libcrypto3=3.5.8-r0" \
    "libssl3=3.5.8-r0"
