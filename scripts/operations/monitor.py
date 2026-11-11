"""Schedule every minute externally. Exit nonzero triggers your monitoring alert.
Never logs URLs, bearer tokens, response bodies or exception details.
"""
import json
import os
import urllib.request


def main():
    origin=os.environ.get('MONITOR_API_ORIGIN','')
    token=os.environ.get('OPERATOR_BEARER','')
    if not origin.startswith('https://') or not token:raise ValueError()
    request=urllib.request.Request(origin.rstrip('/')+'/v1/operations/backlog',headers={'Authorization':'Bearer '+token})
    # No redirects: never forward an operator credential to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    with urllib.request.build_opener(NoRedirect()).open(request,timeout=10) as response:
        data=json.load(response)
    if not data.get('ok') or data['data']['alert']:raise ValueError()


if __name__=='__main__':
    try:main()
    except Exception:
        print('ALERT: operations monitor failed or queue/worker threshold exceeded')
        raise SystemExit(1) from None
    print('OK: queue and worker heartbeat within configured thresholds')
