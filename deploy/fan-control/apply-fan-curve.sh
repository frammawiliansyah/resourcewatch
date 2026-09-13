#!/bin/bash
# Enforces the fan mode on ASUS laptops driven by asus-wmi's custom fan curves.
#
#   apply-fan-curve.sh guard      apply the saved mode, then keep it enforced
#   apply-fan-curve.sh set MODE   save MODE (auto|50|75|100) and apply it now
#
# pwmN_enable on the asus_custom_fan_curve hwmon: 1 = this curve is in force,
# 2 = firmware default. Any platform_profile write (TLP on AC/battery changes,
# Fn+F5) silently resets it to 2, which is why guard keeps checking.
set -euo pipefail

STATE_DIR=/var/lib/fan-curve
STATE_FILE=$STATE_DIR/mode
LOCK_FILE=/run/fan-curve.lock
PROFILE=performance

valid_mode() {
    case "$1" in
        auto|50|75|100) return 0 ;;
        *) return 1 ;;
    esac
}

saved_mode() {
    local mode
    mode=$(cat "$STATE_FILE" 2>/dev/null || true)
    if valid_mode "$mode"; then echo "$mode"; else echo auto; fi
}

save_mode() {
    install -d -m 0755 "$STATE_DIR"
    echo "$1" > "$STATE_FILE.tmp"
    chmod 0644 "$STATE_FILE.tmp"
    mv "$STATE_FILE.tmp" "$STATE_FILE"
}

find_hwmon() {
    local d
    for d in /sys/class/hwmon/hwmon*; do
        if [ "$(cat "$d/name" 2>/dev/null)" = "asus_custom_fan_curve" ]; then
            echo "$d"
            return 0
        fi
    done
    echo "apply-fan-curve: asus_custom_fan_curve hwmon device not found" >&2
    return 1
}

# write_curve HWMON PWM_NODE "temp:pwm ..." -- 8 points, temps strictly increasing, pwm 0-255.
write_curve() {
    local hwmon="$1" node="$2" point=1 pair
    for pair in $3; do
        echo "${pair%%:*}" > "$hwmon/${node}_auto_point${point}_temp"
        echo "${pair##*:}" > "$hwmon/${node}_auto_point${point}_pwm"
        point=$((point + 1))
    done
    echo 1 > "$hwmon/${node}_enable"
}

flat_curve() {
    echo "20:$1 30:$1 40:$1 50:$1 60:$1 70:$1 80:$1 90:$1"
}

apply_mode() {
    local hwmon
    hwmon=$(find_hwmon)
    case "$1" in
        auto)
            # pwm1 = CPU fan (starts at 30%), pwm2 = GPU fan (starts at 25%). Linear
            # ramp 30-55C, aggressive 55-70C, pinned at 100% from 70C up.
            write_curve "$hwmon" pwm1 "30:77 40:98 50:119 55:130 60:172 65:213 70:255 80:255"
            write_curve "$hwmon" pwm2 "30:64 40:90 50:117 55:130 60:172 65:213 70:255 80:255"
            ;;
        50)
            write_curve "$hwmon" pwm1 "$(flat_curve 128)"
            write_curve "$hwmon" pwm2 "$(flat_curve 128)"
            ;;
        75)
            write_curve "$hwmon" pwm1 "$(flat_curve 191)"
            write_curve "$hwmon" pwm2 "$(flat_curve 191)"
            ;;
        100)
            write_curve "$hwmon" pwm1 "$(flat_curve 255)"
            write_curve "$hwmon" pwm2 "$(flat_curve 255)"
            ;;
    esac
    echo "apply-fan-curve: applied mode $1"
}

locked_apply() {
    (
        flock 9
        apply_mode "$1"
    ) 9>"$LOCK_FILE"
}

curve_enforced() {
    local hwmon
    hwmon=$(find_hwmon) || return 1
    [ "$(cat "$hwmon/pwm1_enable")" = 1 ] && [ "$(cat "$hwmon/pwm2_enable")" = 1 ]
}

case "${1:-}" in
    set)
        mode="${2:-}"
        if ! valid_mode "$mode"; then
            echo "usage: $0 set auto|50|75|100" >&2
            exit 2
        fi
        save_mode "$mode"
        locked_apply "$mode"
        ;;
    guard)
        echo "$PROFILE" > /sys/firmware/acpi/platform_profile
        [ -f "$STATE_FILE" ] || save_mode auto
        locked_apply "$(saved_mode)"
        while sleep 2; do
            if ! curve_enforced; then
                echo "apply-fan-curve: custom curve was reset (platform profile change?), re-applying"
                locked_apply "$(saved_mode)"
            fi
        done
        ;;
    *)
        echo "usage: $0 guard | set auto|50|75|100" >&2
        exit 2
        ;;
esac
