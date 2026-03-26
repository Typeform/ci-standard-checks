#!/bin/bash

GITLEAKS_VERSION="v8.16.1"

get_gitleaks_container() {
    repo_name="zricethezav/gitleaks"
    mirror_repo_name="mirror/${repo_name}"
    image_ids="imageTag=${GITLEAKS_VERSION}"
    registry_id="567716553783"

    mirrored_gitleaks="${registry_id}.dkr.ecr.us-east-1.amazonaws.com/${mirror_repo_name}"
    public_gitleaks=${repo_name}

    # Based on https://gist.github.com/outofcoffee/8f40732aefacfded14cce8a45f6e5eb1
    aws ecr describe-images --repository-name=${mirror_repo_name} --image-ids=${image_ids} --registry-id=${registry_id} &>/dev/null
    exit_code=$?

    if [ $exit_code -eq 0 ]; then
        echo $mirrored_gitleaks
    else
        echo $public_gitleaks
    fi

    return
}

get_gitleaks_config_image() {
    image_name="gitleaks-config"
    image_ids="imageTag=latest"
    registry_id="567716553783"

    mirrored_gitleaks="${registry_id}.dkr.ecr.us-east-1.amazonaws.com/${image_name}"
    public_gitleaks="public.ecr.aws/typeform/${image_name}"

    # Based on https://gist.github.com/outofcoffee/8f40732aefacfded14cce8a45f6e5eb1
    aws ecr describe-images --repository-name=${mirrored_gitleaks} --image-ids=${image_ids} --registry-id=${registry_id} &>/dev/null
    exit_code=$?

    if [ $exit_code -eq 0 ]; then
        echo $mirrored_gitleaks
    else
        echo $public_gitleaks
    fi

    return
}

# Retry a command up to N times with a delay between attempts.
# Usage: retry_command <max_retries> <delay_seconds> <command...>
retry_command() {
    local max_retries=$1
    local delay=$2
    shift 2
    local attempt=1

    until "$@"; do
        local status=$?
        if [ $attempt -ge $max_retries ]; then
            echo "Command failed after $attempt attempts. Giving up." >&2
            return $status
        fi
        echo "Command failed (status: $status). Retrying in $delay seconds... (Attempt $attempt of $max_retries)"
        sleep $delay
        attempt=$((attempt + 1))
    done

    echo "Command succeeded on attempt $attempt."
}

# exit when any command fails, output commands
set -ex

# Check if docker is installed
if ! command -v "docker" &> /dev/null
then
    echo "Unable to find docker. Is it installed and added to your \$PATH?"
    exit 1
fi

GITLEAKS_CONFIG_IMAGE=$(get_gitleaks_config_image)

# Pull gitleaks-config image with retry
retry_command 5 5 docker pull "${GITLEAKS_CONFIG_IMAGE}"

repo_dir=$GITHUB_WORKSPACE
repo_name="$(basename "$repo_dir")"

tmp_dir="${repo_dir}/tmp.${RANDOM}"
mkdir -p $tmp_dir

# Generate gitleaks configuration
local_config=".gitleaks.toml"
final_config="$tmp_dir/gitleaks_config.toml"
commits_file="$tmp_dir/commit_list.txt"
gitleaks_config_container="${GITLEAKS_CONFIG_IMAGE}"
gitleaks_container=$(get_gitleaks_container)
gitleaks_config_cmd="python gitleaks_config_generator.py"

# Generate the final gitleaks config file. If the repo has a local config, merge both
if [ -f ./"$local_config" ]; then
    docker container run --rm -v $repo_dir/$local_config:/app/$local_config \
    $gitleaks_config_container $gitleaks_config_cmd > $final_config
else
    docker container run --rm $gitleaks_config_container $gitleaks_config_cmd > $final_config
fi

if [ -z "${GITHUB_BASE_REF}" ]; then
    # push event
    echo "Using commit SHA ${GITHUB_SHA} for push event"
    # not including --first-parent and --no-merges until https://github.com/zricethezav/gitleaks/issues/964 is fixed
    #log_opts="--first-parent --no-merges ${GITHUB_SHA}^..${GITHUB_SHA}"
    log_opts="${GITHUB_SHA}^..${GITHUB_SHA}"
else
    # pull_request event
    pull_number=$(jq --raw-output .pull_request.number "$GITHUB_EVENT_PATH")
    PR_URL="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$pull_number/commits"
    echo "Retrieving PR#$pull_number commits info from ${PR_URL}"
    curl -H "Authorization: Bearer ${GITHUBTOKEN}" $PR_URL > $tmp_dir/commit_list.json
    cat $tmp_dir/commit_list.json | jq 'map(.sha)' | jq '.[]' | sed -r 's/"//g' > $commits_file
    echo "$(cat $commits_file | wc -l | sed -r 's/ //g') commits found in PR#$pull_number"
    base_ref=$(head -n1 $commits_file)
    head_ref=$(tail -n1 $commits_file)
    # not including --first-parent and --no-merges until https://github.com/zricethezav/gitleaks/issues/964 is fixed
    #log_opts="--first-parent --no-merges ${base_ref}^..${head_ref}"
    log_opts="${base_ref}^..${head_ref}"
fi

# Do not exit if the gitleaks run fails. This way we can display some custom messages.
set +e

echo "Using the following gitleaks container image: ${gitleaks_container}:${GITLEAKS_VERSION}"

# Pre-pull gitleaks image with retry to handle transient Docker Hub errors
retry_command 5 5 docker pull "${gitleaks_container}:${GITLEAKS_VERSION}"

# Run gitleaks with the generated config
gitleaks_cmd="detect \
    --config=${final_config} \
    --source=/tmp/${repo_name} \
    --report-format=json \
    --log-opts=${log_opts} \
    --verbose"
echo "${gitleaks_cmd}"

# Retry the scan on Docker infrastructure errors (exit code 125).
# Exit codes 0 (no secrets) and 1 (secrets found) are final results.
SCAN_MAX_RETRIES=3
SCAN_RETRY_DELAY=10
scan_attempt=1

while true; do
    docker container run --rm --name=gitleaks \
        -v $final_config:$final_config \
        -v $commits_file:$commits_file \
        -v $repo_dir:/tmp/$repo_name \
        $gitleaks_container:$GITLEAKS_VERSION ${gitleaks_cmd}

    exit_code=$?

    if [ $exit_code -eq 0 ] || [ $exit_code -eq 1 ]; then
        # Scan completed successfully (0 = clean, 1 = secrets found)
        break
    elif [ $exit_code -eq 125 ] && [ $scan_attempt -lt $SCAN_MAX_RETRIES ]; then
        echo "Docker infrastructure error (exit code 125). Retrying in $SCAN_RETRY_DELAY seconds... (Attempt $scan_attempt of $SCAN_MAX_RETRIES)"
        sleep $SCAN_RETRY_DELAY
        scan_attempt=$((scan_attempt + 1))
    else
        # Non-retryable error or retries exhausted
        break
    fi
done

# If a secret was detected show what to do next
notion_page='https://www.notion.so/typeform/Detecting-Secrets-and-Keeping-Them-Secret-c2c427bf1ded4b908ce9b2746ffcde88'

if [ $exit_code -eq 0 ]; then
    echo "Scan finished. No secrets were detected"
elif [ $exit_code -eq 1 ]; then
    echo -e "Scan finished. Either one or more secrets were uploaded, or it is a false-positive. Check out this Notion page to know what to do next ${notion_page}"
else
    echo "Error scanning"
fi

exit $exit_code
