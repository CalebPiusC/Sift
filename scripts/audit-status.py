"""S0 documentation generator. No providers, credentials or application mutations.
Run from repo root: python3 scripts/audit-status.py [--check].
"""
import ast
import json
import re
import sys
from pathlib import Path


def routes():
    found=[]
    for file in sorted(Path('api/app').rglob('*.py')):
        tree=ast.parse(file.read_text());prefix=''
        for node in ast.walk(tree):
            if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='APIRouter':
                prefix=next((k.value.value for k in node.keywords if k.arg=='prefix' and isinstance(k.value,ast.Constant)),'')
        for node in tree.body:
            if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):continue
            for dec in node.decorator_list:
                if isinstance(dec,ast.Call) and isinstance(dec.func,ast.Attribute) and dec.func.attr in ('get','post','patch','put','delete') and dec.args and isinstance(dec.args[0],ast.Constant):
                    found.append({'method':dec.func.attr.upper(),'path':prefix+dec.args[0].value,'file':str(file),'handler':node.name,'line':node.lineno})
    return found


def build():
    actual=routes()
    capabilities=json.loads(Path('docs/capability-evidence.json').read_text())
    endpoints=json.loads(Path('docs/backend/endpoints.json').read_text())
    canonical=lambda p:re.sub(r'\{[^}]+\}','{}',p)
    lookup={(r['method'],canonical(r['path'])):r for r in actual}
    rows=['# Product status matrix — authoritative S0 inventory','',
          'This is the single source of truth for current capability status. Scope: every frontend contract operation, every declared FastAPI route, and the cross-cutting/product capabilities below. Read alongside [B1 gap audit](backend/b1-gap-audit.md). S1 is **in progress**: settings read/member preferences are the initial slice; catalogue/media/business mutations and full API-backed browser acceptance remain incomplete. S2 is **not implemented**.',
          '', '## Reading the evidence', '',
          '- **Implemented:** yes = scoped behavior exists; partial = limited subset/scaffolding; no = absent. Mock-only product workflows count partial, not real backend completion.',
          '- **Frontend uses real API:** yes = concrete consumer and supported server path; partial = optional API-mode wiring/DTO or dependent-read gaps; no = absent, internal-only or sample-only. Adapter URLs alone are not proof.',
          '- **Locally tested:** yes = relevant test/demo evidence; partial = only sample, unit, boundary-double or incomplete coverage; no = no identified proving test. Files are inspectable evidence, not a promise of a green current suite.',
          '- **Live-provider tested / Release-approved:** all no: no captured real provider run or release sign-off is present. Configurations, tests with fake providers and previous phase names do not change that.',
          '- **Current execution:** see [S0 validation](s0-validation.md). Test references describe coverage, not live delivery. Default DATA_MODE remains mock; S0 never removes a truthful sample banner.',
          '', '## Product and cross-cutting capabilities','',
          '| Capability | Implemented | Frontend uses real API | Locally tested | Live-provider tested | Release-approved | Proof / limitation |',
          '|---|---|---|---|---|---|---|']
    for c in capabilities:
        for k in ('implemented','frontend','local'):
            assert c[k] in ('yes','no','partial')
        rows.append('| '+' | '.join((c['name'],c['implemented'],c['frontend'],c['local'],'no','no',c['proof']))+' |')
    rows+=['','## Every frontend contract / planned supporting operation','',
           'These rows retain every decision in `backend/endpoints.json`; optional/absent targets are not silently omitted. Source of frontend calls: `web/lib/data/api.ts`; consumers and gaps: the B1 audit and product rows above. Route existence alone is conservatively **partial**, not full behavior or browser acceptance.', '',
           '| Capability | Implemented | Frontend uses real API | Locally tested | Live-provider tested | Release-approved | Proof / limitation |',
           '|---|---|---|---|---|---|---|']
    for e in endpoints:
        path=e['path'] if e['path']=='/health' else '/v1'+e['path']
        r=lookup.get((e['method'],canonical(path)))
        internal=e['method'] in ('LOCAL','INTERNAL')
        impl='partial' if r or internal or e['status']=='partial' else 'no'
        frontend='partial' if r and not e['function'].startswith(('Future.','Infrastructure.')) else 'no'
        local='partial' if e['function'].split('.')[0] in ('CatalogueData','SettingsData','ConversationsData','OrdersData','ReceiptsData','CustomersData','ExtrasData','BillingData','TeamData','MessagesData','ApprovalsData','ChannelsData','MockControls','RealtimeData') else 'no'
        proof=(f"`{r['file']}::{r['handler']}`; " if r else '')+e['notes']
        suite={'CatalogueData':'web/tests/catalogue.test.ts (mock); api/tests/test_whatsapp.py (typed parser only)', 'SettingsData':'web/tests/settings.test.ts (mock); api/tests/test_reply_engine.py (policy only)', 'ConversationsData':'tests/helpers/b2-runtime.py', 'MessagesData':'tests/helpers/b2-runtime.py', 'OrdersData':'tests/helpers/b4_checks.py', 'ReceiptsData':'tests/helpers/b4_checks.py', 'CustomersData':'tests/helpers/b7_checks.py', 'ExtrasData':'tests/helpers/b7_checks.py', 'BillingData':'tests/helpers/b8_checks.py', 'TeamData':'tests/helpers/b7_checks.py (GET only)', 'ApprovalsData':'tests/helpers/b3_checks.py', 'ChannelsData':'tests/helpers/b5_checks.py; api/tests/test_pipeline.py', 'MockControls':'web/tests/data.test.ts', 'RealtimeData':'web/tests/pipeline.test.tsx'}.get(e['function'].split('.')[0])
        if suite:proof+=' Coverage: `'+suite+'`.'
        if e['status']=='not-implemented':frontend='no'
        rows.append('| '+' | '.join((e['function'],impl,frontend,local,'no','no',proof.replace('|','/')))+' |')
    mapped={(e['method'],canonical(e['path'] if e['path']=='/health' else '/v1'+e['path'])) for e in endpoints}
    rows += ['', '## Additional registered HTTP capabilities', '',
             'Routes not already represented by a contract decision above. Local no means no route-specific proving test was identified; code existence does not imply tested acceptance. See product rows for related internal/unit evidence.', '',
             '| Capability | Implemented | Frontend uses real API | Locally tested | Live-provider tested | Release-approved | Proof / limitation |',
             '|---|---|---|---|---|---|---|']
    # Filesystem enumeration order differs between local checkouts and CI.
    tests=sorted(Path('api/tests').glob('*.py'))+sorted(Path('tests/helpers').glob('*.py'))
    for r in actual:
        if (r['method'],canonical(r['path'])) in mapped:continue
        hits=[str(p) for p in tests if r['path'] in p.read_text()]
        local='partial' if hits else 'no'
        front='partial' if r['path'] in ('/v1/operations/vendor','/v1/operations/vendor/ai-pause','/v1/feedback') else 'no'
        proof=f"`{r['file']}::{r['handler']}`; " + ('Coverage references: '+', '.join(hits) if hits else 'No route-specific test proof identified; inspect before promoting status.')
        rows.append('| '+' | '.join((r['method']+' `'+r['path']+'`','partial',front,local,'no','no',proof))+' |')
    route_lines=['# Registered HTTP route audit','',
                 'Generated from Python AST route decorators in mounted application modules. It proves route declarations, not successful responses, DTO compatibility, permissions or live providers. All API routers are mounted in `api/app/main.py`. See [status matrix](../status-matrix.md) for acceptance.', '',
                 '| Method | Path | Source handler |','|---|---|---|']
    route_lines += [f"| {r['method']} | `{r['path']}` | `{r['file']}:{r['line']}::{r['handler']}` |" for r in actual]
    return {'docs/status-matrix.md':'\n'.join(rows)+'\n','docs/backend/route-audit.md':'\n'.join(route_lines)+'\n','docs/backend/route-inventory.json':json.dumps(actual,indent=2)+'\n'}


if __name__=='__main__':
    mismatch=[]
    for name,content in build().items():
        if '--check' in sys.argv:
            if not Path(name).exists() or Path(name).read_text()!=content:mismatch.append(name)
        else:Path(name).write_text(content)
    if mismatch:
        print('Stale S0 inventory: '+', '.join(mismatch));raise SystemExit(1)
    print('S0 inventory '+('checked' if '--check' in sys.argv else 'generated'))
