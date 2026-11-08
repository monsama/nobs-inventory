# Shared by backup.sh and restore.sh (sourced, not run): the check that an encrypted backup was not changed after it
# was made. openssl enc (AES-256-CBC) keeps the archive secret but does not notice a changed file, so the encrypted file
# gets a first line: "NOBSMAC1 <salt> <HMAC-SHA256 of the rest>". The key for the HMAC comes from the same passphrase
# through PBKDF2 (600000 rounds, its own salt), so it costs as much to guess as the encryption itself. The key never
# goes on a command line (where other users of the server could see it): openssl prints it into a pipe, and the HMAC
# is worked out here with sha256sum and the shell's own printf.
MAC_TAG='NOBSMAC1'
MAC_HEAD_LEN=91   # "NOBSMAC1 " + 16 hex + " " + 64 hex + newline

# mac_key <salt, 16 hex> <openssl -pass argument, e.g. file:/path or env:NAME>: prints the 32-byte key as hex.
mac_key() {
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -S "$1" -pass "$2" -P 2>/dev/null | sed -n 's/^key *= *//p'
}

# mac_file <key, 64 hex> <file>: prints the HMAC-SHA256 of the file as hex (RFC 2104, a 32-byte key padded to 64).
mac_file() {
  local k="$1" f="$2" i b ip='' op='' inner
  [ "${#k}" -eq 64 ] || return 1
  for ((i = 0; i < 64; i++)); do
    if ((i < 32)); then b=$((16#${k:i*2:2})); else b=0; fi
    ip+="$(printf '\\x%02x' $((b ^ 0x36)))"; op+="$(printf '\\x%02x' $((b ^ 0x5c)))"
  done
  inner="$({ printf '%b' "$ip"; cat "$f"; } | sha256sum | cut -c1-64)"
  { printf '%b' "$op"; printf '%b' "$(sed 's/../\\x&/g' <<<"$inner")"; } | sha256sum | cut -c1-64
}

# mac_seal <openssl -pass argument> <encrypted file> <out>: writes the first line and the encrypted file after it.
mac_seal() {
  local salt key mac
  salt="$(openssl rand -hex 8)"; key="$(mac_key "$salt" "$1")"
  [ "${#key}" -eq 64 ] || { echo "[ERROR] The key for the backup's check could not be made." >&2; return 1; }
  mac="$(mac_file "$key" "$2")"; key=''
  { printf '%s %s %s\n' "$MAC_TAG" "$salt" "$mac"; cat "$2"; } > "$3"
}

# mac_open <openssl -pass argument> <sealed file> <out>: checks the first line and writes the encrypted part to out.
# Returns 2 for a backup without the line (made before backups had it), 1 when the file was changed.
mac_open() {
  local head salt want key got
  [ "$(head -c 9 "$2")" = "$MAC_TAG " ] || return 2
  head="$(head -n 1 "$2")"
  [[ "$head" =~ ^NOBSMAC1\ ([0-9a-f]{16})\ ([0-9a-f]{64})$ ]] || return 1
  salt="${BASH_REMATCH[1]}"; want="${BASH_REMATCH[2]}"
  tail -c +"$((MAC_HEAD_LEN + 1))" "$2" > "$3"
  key="$(mac_key "$salt" "$1")"; [ "${#key}" -eq 64 ] || return 1
  got="$(mac_file "$key" "$3")"; key=''
  [ "$got" = "$want" ] || { rm -f "$3"; return 1; }
}
