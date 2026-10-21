"""Check that the deployed frontend serves every local ES module, not SPA HTML."""
import re
import sys
from urllib.parse import urljoin
from urllib.request import urlopen


def check(base):
    pending = [urljoin(base, '/app.js')]
    checked = set()
    while pending:
        url = pending.pop()
        if url in checked:
            continue
        with urlopen(url, timeout=10) as response:
            if response.headers.get_content_type() not in ('application/javascript', 'text/javascript'):
                raise RuntimeError(f'Module is missing or not JavaScript: {url}')
            source = response.read().decode('utf-8')
        checked.add(url)
        for path in re.findall(r"(?:from\s*|import\s*)['\"](\./[^'\"]+\.js)['\"]", source):
            pending.append(urljoin(url, path))
    print(f'{len(checked)} frontend modules verified in the deployed image.')


if __name__ == '__main__':
    check(sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080')
