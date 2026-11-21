#!/usr/bin/env bash
#
# Usage:
#   ./paraller_script.sh -s <script> -f <ext> [-j <jobcount>] [-d <dir>] [-l <logdir>]
#
#   -s  실행할 스크립트 (필수)
#   -f  대상 파일의 끝자리 확장자 (필수)
#   -j  동시 실행 작업 수 (기본값: 4)
#   -d  대상 파일을 찾을 디렉토리 (기본값: ./)
#   -l  로그를 저장할 디렉토리 (기본값: logs)
#
# 지정한 디렉토리에서 확장자가 일치하는 파일들을 찾아, 각 파일을 인자로
# 스크립트를 병렬로 실행한다. 각 파일의 출력은 로그 디렉토리에 저장되고,
# 마지막에 전체 실행 결과 요약을 출력한다.

set -uo pipefail

jobcount=4
dir="."
logdir="logs"
script=""
ext=""

while getopts "s:j:d:f:l:" opt; do
  case "$opt" in
    s) script="$OPTARG" ;;
    j) jobcount="$OPTARG" ;;
    d) dir="$OPTARG" ;;
    f) ext="$OPTARG" ;;
    l) logdir="$OPTARG" ;;
    *)
      echo "Usage: $0 -s <script> -f <ext> [-j <jobcount>] [-d <dir>] [-l <logdir>]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$script" ]]; then
  echo "Error: -s <script> 옵션은 필수입니다." >&2
  exit 1
fi

if [[ -z "$ext" ]]; then
  echo "Error: -f <ext> 옵션은 필수입니다." >&2
  exit 1
fi

if [[ ! -f "$script" ]]; then
  echo "Error: 스크립트 '$script' 를 찾을 수 없습니다." >&2
  exit 1
fi

if [[ ! -d "$dir" ]]; then
  echo "Error: 디렉토리 '$dir' 를 찾을 수 없습니다." >&2
  exit 1
fi

mkdir -p "$logdir"

# 실행할 명령 결정 (실행 권한이 있으면 그대로, 아니면 bash로 실행)
if [[ -x "$script" ]]; then
  case "$script" in
    */*) run_cmd=("$script") ;;
    *) run_cmd=("./$script") ;;
  esac
else
  run_cmd=(bash "$script")
fi

# 대상 파일 목록 수집
mapfile -d '' files < <(find "$dir" -maxdepth 1 -type f -name "*.${ext}" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "'$dir' 디렉토리에서 '*.${ext}' 파일을 찾을 수 없습니다."
  exit 0
fi

result_file=$(mktemp)
trap 'rm -f "$result_file"' EXIT

start_time=$(date +%s)

run_one() {
  local file="$1"
  local base
  base=$(basename "$file")
  local logfile="$logdir/${base}.log"
  local fstart fend status

  fstart=$(date +%s)
  if "${run_cmd[@]}" "$file" > "$logfile" 2>&1; then
    status=0
  else
    status=$?
  fi
  fend=$(date +%s)

  printf '%s|%s|%s\n' "$file" "$status" "$((fend - fstart))" >> "$result_file"
}

running=0
for f in "${files[@]}"; do
  run_one "$f" &
  running=$((running + 1))
  if (( running >= jobcount )); then
    wait -n
    running=$((running - 1))
  fi
done

wait

end_time=$(date +%s)
total_elapsed=$((end_time - start_time))

total=${#files[@]}
success=0
failed=0
failed_files=()

while IFS='|' read -r file status elapsed; do
  if [[ "$status" == "0" ]]; then
    success=$((success + 1))
  else
    failed=$((failed + 1))
    failed_files+=("$file (exit=$status)")
  fi
done < "$result_file"

echo
echo "===================== Parallel Summary ====================="
echo "Script    : $script"
echo "Directory : $dir"
echo "Extension : *.${ext}"
echo "Jobs      : $jobcount"
echo "Log dir   : $logdir"
echo "--------------------------------------------------------------"
echo "Total     : $total"
echo "Success   : $success"
echo "Failed    : $failed"
echo "Elapsed   : ${total_elapsed}s"
if [[ $failed -gt 0 ]]; then
  echo "--------------------------------------------------------------"
  echo "Failed files:"
  for ff in "${failed_files[@]}"; do
    echo "  - $ff"
  done
fi
echo "================================================================"

if [[ $failed -gt 0 ]]; then
  exit 1
fi
