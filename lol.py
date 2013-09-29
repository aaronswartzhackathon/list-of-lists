import os
from psychotherapist import CouchTherapy, init, get_psychotherapist_creds, log
import subprocess
import sys

OWNER = "mail@rmozone.com"
HOSTNAME = "aaronswartzhackathon.org"

APPNAME = "lol"

basedir = os.path.abspath(os.path.dirname(__file__))
exepath = '"%s" "%s"' % (sys.executable, os.path.abspath(__file__))
execmd = [sys.executable, os.path.abspath(__file__)]

class LOL(CouchTherapy):
    def doc_created(self, db, doc):
        if len(doc.get("list", [])) > 0:
            log("created")
            pass
    def doc_updated(self, db, doc):
        if len(doc.get("list", [])) > 0:
            log("updated")
            pass

if __name__=='__main__':
    if len(sys.argv) == 2 and sys.argv[1] == "sit-down":
        log("LOL is running within Couch")
        lol = LOL()
        try:
            lol.run_forever()
        except Exception, err:
            import traceback
            for line in traceback.format_exc().split('\n'):
                log(line)
            import time
            time.sleep(20)
            sys.exit(1)

    elif len(sys.argv) == 1:
        from PyQt4 import QtGui
        from gui import get_main_window

        PORT=5987
        
        app = QtGui.QApplication(sys.argv)
        app.setApplicationName(APPNAME)

        p = init(basedir, exepath, name=APPNAME, port=PORT)
        creds = get_psychotherapist_creds(os.path.join(os.getenv("HOME"), ".freud", APPNAME, "conf"))
        main = get_main_window(creds, port=PORT)

        app.exec_()

        p.kill()
        p.wait()
        
    elif len(sys.argv) == 3 and sys.argv[1] == "stand-alone":
        lol = LOL(server_uri=sys.argv[2], basedir=basedir)
        lol.run_forever()
