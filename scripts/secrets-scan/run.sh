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

# exit when any command fails
set -e

# Check if docker is installed
if ! command -v "docker" &> /dev/null
then
    echo "Unable to find docker. Is it installed and added to your \$PATH?"
    exit 1
fi

DOCKERREGISTRY=public.ecr.aws
docker pull ${DOCKERREGISTRY}/typeform/gitleaks-config
exit_code=$?

if [ ! $exit_code -eq 0 ]; then
    echo "Unable to pull gitleaks container image from ${DOCKERREGISTRY}"
    exit 1
fi

repo_dir=$GITHUB_WORKSPACE
repo_name="$(basename "$repo_dir")"

tmp_dir="${repo_dir}/tmp.${RANDOM}"
mkdir -p $tmp_dir

# Generate gitleaks configuration
local_config=".gitleaks.toml"
final_config="$tmp_dir/gitleaks_config.toml"
commits_file="$tmp_dir/commit_list.txt"
gitleaks_config_container="${DOCKERREGISTRY}/typeform/gitleaks-config"
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

# Run gitleaks with the generated config
gitleaks_cmd="detect \
    --config=${final_config} \
    --source=/tmp/${repo_name} \
    --report-format=json \
    --log-opts=${log_opts} \
    --verbose"
echo "${gitleaks_cmd}"
docker container run --rm --name=gitleaks \
    -v $final_config:$final_config \
    -v $commits_file:$commits_file \
    -v $repo_dir:/tmp/$repo_name \
    $gitleaks_container:$GITLEAKS_VERSION ${gitleaks_cmd}

# Keep the exit code of the gitleaks run
exit_code=$?

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
