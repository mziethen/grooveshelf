from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
import pytest

spec=spec_from_file_location('nfc_bridge',Path(__file__).resolve().parents[2]/'scripts'/'nfc_bridge.py')
module=module_from_spec(spec);spec.loader.exec_module(module)


def test_presence_edges_emit_one_scan_until_tag_is_removed():
    calls=[];bridge=module.ScanBridge(lambda endpoint,data:calls.append((endpoint,data)))
    for uid in [b'\x04\x11\x22\x33\x44\x55\x66',b'\x04\x11\x22\x33\x44\x55\x66',None,b'\x04\x11\x22\x33\x44\x55\x66']:
        bridge.observe(uid)
    assert len(calls)==2
    assert calls[0]==('scans',{'uid':'04112233445566'})


def test_reader_error_is_reported_without_being_overwritten():
    class Reader:
        def read_uid(self,timeout): raise RuntimeError('hardware error')
    calls=[]
    with pytest.raises(RuntimeError):
        module.run_reader(Reader(),lambda endpoint,data:calls.append((endpoint,data)))
    assert calls[-1]==('reader',{'status':'error'})
