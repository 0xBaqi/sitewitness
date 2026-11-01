import tempfile, pathlib, subprocess, ssl, http.client, http.server, threading, time
repo=pathlib.Path(__file__).resolve().parents[1]
import argparse, shutil
parser=argparse.ArgumentParser(description="Isolated preview proxy test; requires nginx and openssl; uses loopback ports 39300/39443.")
parser.add_argument('--nginx',default=shutil.which('nginx'))
args=parser.parse_args()
if not args.nginx or not shutil.which('openssl'): parser.error('nginx and openssl are required')
binary=str(pathlib.Path(args.nginx).resolve())
class Upstream(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(self.headers.get('Authorization','').encode())
    def log_message(self,*args): pass
server=http.server.HTTPServer(('127.0.0.1',39300),Upstream)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with tempfile.TemporaryDirectory(prefix='sitewitness-nginx-') as d:
    p=pathlib.Path(d)
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(p/'key.pem'),'-out',str(p/'cert.pem'),'-days','1','-subj','/CN=localhost'],check=True,capture_output=True)
    acl=p/'allowlist.conf'
    acl.write_text((repo/'deploy/sitewitness-preview-allowlist.conf.example').read_text())
    body=(repo/'deploy/nginx.conf.example').read_text().replace('listen 443 ssl;', 'listen 127.0.0.1:39443 ssl;').replace('/etc/ssl/sitewitness/fullchain.pem',str(p/'cert.pem')).replace('/etc/ssl/sitewitness/privkey.pem',str(p/'key.pem')).replace('/etc/nginx/sitewitness-preview-allowlist.conf',str(acl)).replace('127.0.0.1:3000','127.0.0.1:39300')
    config=p/'nginx.conf'
    config.write_text('pid '+str(p/'nginx.pid')+';\nerror_log '+str(p/'error.log')+';\nevents {}\nhttp { client_body_temp_path '+str(p/'body')+'; proxy_temp_path '+str(p/'proxy')+'; fastcgi_temp_path '+str(p/'fastcgi')+'; uwsgi_temp_path '+str(p/'uwsgi')+'; scgi_temp_path '+str(p/'scgi')+';\n'+body+'\n}\n')
    cmd=[binary,'-p',d+'/', '-c',str(config)]
    subprocess.run(cmd+['-t'],check=True,capture_output=True)
    print('PASS nginx syntax with isolated certificate and paths',flush=True)
    def request(path):
        c=http.client.HTTPSConnection('127.0.0.1',39443,context=ssl._create_unverified_context(),timeout=5)
        c.request('GET',path,headers={'Host':'inspections.example.invalid','X-Forwarded-For':'192.0.2.10','Authorization':'Bearer synthetic-test-only'})
        r=c.getresponse(); status=r.status; headers=dict(r.getheaders()); data=r.read(); c.close()
        return status,headers,data
    def run_case(allowed):
        proc=subprocess.Popen(cmd+['-g','daemon off;'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        try:
            for attempt in range(30):
                try: result=request('/'); break
                except ConnectionRefusedError: time.sleep(.1)
            else: raise RuntimeError('nginx did not start')
            for path in ['/','/vault','/_next/static/test.js','/api/archives']:
                status,headers,data=request(path)
                assert status==(200 if allowed else 403),(path,status)
                assert headers['X-Robots-Tag']=='noindex, nofollow, noarchive'
                assert headers['X-Frame-Options']=='DENY'
                if allowed: assert data==b'Bearer synthetic-test-only'
            print('PASS '+('allowed network reaches all paths; bearer preserved' if allowed else 'default deny covers workspace/vault/assets/API; forged forwarded IP denied'),flush=True)
        finally:
            proc.terminate(); proc.wait(timeout=10)
    run_case(False)
    acl.write_text('allow 127.0.0.1;\ndeny all;\n')
    run_case(True)
    acl.unlink()
    assert subprocess.run(cmd+['-t'],capture_output=True).returncode!=0
    print('PASS missing allowlist fails validation',flush=True)
finally:
 server.shutdown();server.server_close()
