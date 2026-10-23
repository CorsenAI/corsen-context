import { describe, it, expect } from 'vitest';
import { isPrivateIp } from '../src/security.js';

describe('isPrivateIp — IPv6 transition forms', () => {
  it('decodes the IPv4 embedded in NAT64, 6to4 and Teredo addresses', () => {
    expect(isPrivateIp('64:ff9b::7f00:1')).toBe(true); // 127.0.0.1 behind well-known NAT64
    expect(isPrivateIp('64:ff9b::10.0.0.1')).toBe(true);
    expect(isPrivateIp('64:ff9b:1::a9fe:a9fe')).toBe(true); // local-use NAT64, 169.254.169.254
    expect(isPrivateIp('64:ff9b::808:808')).toBe(false); // 8.8.8.8
    expect(isPrivateIp('2002:7f00:1::')).toBe(true); // 6to4 of 127.0.0.1
    expect(isPrivateIp('2002:c000:22d::')).toBe(false); // 6to4 of 192.0.2.45
    expect(isPrivateIp('2001:0:4136:e378:8000:63bf:f5ff:fffe')).toBe(true); // Teredo client 10.0.0.1
    expect(isPrivateIp('2001:0:4136:e378:8000:63bf:3fff:fdd2')).toBe(false); // Teredo client 192.0.2.45
  });

  it('still recognizes IPv4-mapped forms in dotted and hexadecimal notation', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateIp('[::ffff:a9fe:a9fe]')).toBe(true);
    expect(isPrivateIp('::ffff:808:808')).toBe(false);
    expect(isPrivateIp('::10.0.0.1')).toBe(true); // IPv4-compatible (deprecated)
  });

  it('treats multicast, reserved, site-local and discard ranges as non-public', () => {
    expect(isPrivateIp('224.0.0.251')).toBe(true);
    expect(isPrivateIp('239.255.255.250')).toBe(true);
    expect(isPrivateIp('240.0.0.1')).toBe(true);
    expect(isPrivateIp('255.255.255.255')).toBe(true);
    expect(isPrivateIp('ff02::1')).toBe(true);
    expect(isPrivateIp('fec0::1')).toBe(true);
    expect(isPrivateIp('100::1')).toBe(true);
    expect(isPrivateIp('fe80::1%eth0')).toBe(true);
  });

  it('keeps public literals public and ignores malformed input', () => {
    expect(isPrivateIp('203.0.113.9')).toBe(false);
    expect(isPrivateIp('223.255.255.255')).toBe(false);
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateIp('2001:db8::1')).toBe(false);
    expect(isPrivateIp('example.com')).toBe(false);
    expect(isPrivateIp('1:2:3:4:5:6:7:8:9')).toBe(false);
    expect(isPrivateIp('::ffff:999.1.1.1')).toBe(false);
  });
});
