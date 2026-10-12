#!/usr/bin/env bash
# Tạo khoá ký ứng dụng (chỉ làm 1 LẦN, rồi CẤT KỸ file .keystore + mật khẩu — mất là không cập nhật được app trên Google Play).
# Dùng:  bash scripts/make-keystore.sh
set -e
KS=kla-release.keystore
read -rp  "Alias khoá (vd: kla): " ALIAS; ALIAS=${ALIAS:-kla}
read -rsp "Mật khẩu keystore (>= 6 ký tự): " PASS; echo
keytool -genkeypair -v -keystore "$KS" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass "$PASS" -keypass "$PASS" -dname "CN=Kho Lanh, O=Kho Lanh, C=VN"
base64 -w0 "$KS" > keystore.b64 2>/dev/null || base64 "$KS" | tr -d '\n' > keystore.b64
echo
echo "Đã tạo: $KS (cất kỹ, KHÔNG đưa lên GitHub) và keystore.b64"
echo "Vào GitHub → Settings → Secrets and variables → Actions → New repository secret, tạo 4 secret:"
echo "  KLA_KEYSTORE_B64      = nội dung file keystore.b64"
echo "  KLA_KEYSTORE_PASSWORD = mật khẩu vừa nhập"
echo "  KLA_KEY_ALIAS         = $ALIAS"
echo "  KLA_KEY_PASSWORD      = mật khẩu vừa nhập (cùng mật khẩu)"
