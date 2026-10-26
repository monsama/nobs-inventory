Test certificates for the directory CA upload: `ca.crt` (a CA, PEM), `ca.cer` (the same, DER as Windows exports it)
and `dc.crt` (a server certificate the CA issued). `dc.key` is the test server's key, so a test can run an LDAPS server with `dc.crt`. The CA's key is not kept; none of these sign anything real.
