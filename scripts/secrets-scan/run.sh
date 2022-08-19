#!/bin/bash

# exit when any command fails
set -e

# Check if docker is installed
if ! command -v "docker" &> /dev/null
then
    echo "Unable to find docker. Is it installed and added to your \$PATH?"
    exit 1
fi
# Check if user is logged in to quay.io

DOCKERREGISTRY=quay.io
docker login -u=${DOCKERUSERNAME} -p=${DOCKERPASSWORD} ${DOCKERREGISTRY}
docker pull ${DOCKERREGISTRY}/typeform/gitleaks-config
exit_code=$?

if [ ! $exit_code -eq 0 ]; then
    echo "Unable to pull gitleaks container image. Are you logged in ${DOCKERREGISTRY}?"
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
gitleaks_container="zricethezav/gitleaks"
gitleaks_version="v8.8.8"
gitleaks_config_cmd="python gitleaks_config_generator.py --v8-config"

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
    commit_opts="--log-opts=${GITHUB_SHA}..${GITHUB_SHA}"
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
    commit_opts="--log-opts=$base_ref~1..$head_ref"
fi

# Do not exit if the gitleaks run fails. This way we can display some custom messages.
set +e

echo "Using gitleaks${gitleaks_version}"

# Run gitleaks with the generated config
gitleaks_cmd="detect \
    --config ${final_config} \
    --source /tmp/${repo_name} \
    --report-format json \
    ${commit_opts} \
    --verbose"
docker container run --rm --name=gitleaks \
    -v $final_config:$final_config \
    -v $commits_file:$commits_file \
    -v $repo_dir:/tmp/$repo_name \
    $gitleaks_container:$gitleaks_version ${gitleaks_cmd}

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

# Clean up
docker logout

exit $exit_code
