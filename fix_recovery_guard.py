f = open('frontend/src/screens/Game.jsx').read()
old = 'if (!address || recoveryRan.current) return'
new = 'if (!address) return'
if old in f:
    f = f.replace(old, new)
    open('frontend/src/screens/Game.jsx', 'w').write(f)
    print('Done')
else:
    print('Not found — already patched or different text')
    # Show context around recoveryRan
    idx = f.find('recoveryRan')
    print(repr(f[idx-50:idx+100]))
