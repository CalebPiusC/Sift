"""Offline production configuration gate. Only field names are reported."""
import sys
sys.path.insert(0,'api')
from app.config import Settings


def check(s):
    failures=[]
    for name in ('pipeline_enabled','rate_limit_enabled'):
        if not getattr(s,name):failures.append(name)
    for name in ('identity_pepper','pipeline_keys','paystack_secret_key','meta_app_secret','gemini_api_key','email_api_key'):
        if not getattr(s,name).get_secret_value():failures.append(name)
    if not s.public_web_url.startswith('https://'):failures.append('public_web_url')
    if not s.operator_user_ids:failures.append('operator_user_ids')
    if s.whatsapp_mode!='live':failures.append('whatsapp_mode')
    if not s.web_origins or any(not x.startswith('https://') or '*' in x for x in s.web_origins):failures.append('web_origins')
    try:
        from app.pipeline.crypto import Crypto
        Crypto(s)
    except (ValueError,KeyError,TypeError):failures.append('encryption_keyring')
    return failures


if __name__=='__main__':
    try:failures=check(Settings())
    except Exception:
        print('FAIL: invalid environment configuration');raise SystemExit(1) from None
    print('FAIL: review '+', '.join(failures) if failures else 'PASS: offline configuration only; live checklist is still required')
    raise SystemExit(bool(failures))
