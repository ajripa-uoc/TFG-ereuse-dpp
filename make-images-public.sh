#!/bin/bash

PACKAGES=(
    "tfg-ereuse-dpp/id-index-api"
    "tfg-ereuse-dpp/blockchain-node"
    "tfg-ereuse-dpp/api-connector"
    "tfg-ereuse-dpp/veramo-api"
    "tfg-ereuse-dpp/did-resolver"
    "tfg-ereuse-dpp/dpp-indexer"
)

# Check if PAT is set
if [ -z "$PAT" ]; then
    echo "Please set PAT environment variable"
    exit 1
fi

for package in "${PACKAGES[@]}"; do
    echo "Making $package public..."

    curl -L \
        -X PATCH \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer $PAT" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/user/packages/container/$package" \
        -d '{"visibility":"public"}' \
        || echo "Failed to make $package public"
done

echo "Completed setting package visibility"