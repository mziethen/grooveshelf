"""Offline portable archive commands; stop the backend and NFC bridge before export."""
import argparse
import json
from .archive import export_archive, verify_archive, restore_archive


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    export=commands.add_parser('export');export.add_argument('--database',required=True);export.add_argument('--output',required=True)
    verify=commands.add_parser('verify');verify.add_argument('archive')
    restore=commands.add_parser('restore');restore.add_argument('archive');restore.add_argument('--destination',required=True)
    args=parser.parse_args()
    try:
        if args.command=='export':result=export_archive(args.database,args.output)
        elif args.command=='verify':result=verify_archive(args.archive)
        else:result=restore_archive(args.archive,args.destination)
    except Exception as error:
        parser.exit(1,f'Archive operation failed: {error}\n')
    print(json.dumps({'status':'ok','operation':args.command,'format_version':result['version'],'files':len(result['files'])}))


if __name__=='__main__':main()
