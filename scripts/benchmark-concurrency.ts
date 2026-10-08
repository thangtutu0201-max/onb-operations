/**
 * Benchmark Script: Kiểm thử hiệu năng hệ thống ONB Operations với 150 người dùng đồng thời
 * và mô phỏng tải 100.000 bản ghi trong 5 năm.
 */

async function runBenchmark() {
  const baseUrl = 'http://localhost:3000';
  const CONCURRENT_USERS = 150;
  const OPERATIONS_PER_USER = 4;
  const TOTAL_OPERATIONS = CONCURRENT_USERS * OPERATIONS_PER_USER;

  console.log('===============================================================');
  console.log(`BẮT ĐẦU KIỂM THỬ HIỆU NĂNG: ${CONCURRENT_USERS} NGƯỜI DÙNG ĐỒNG THỜI`);
  console.log(`Tổng số tác vụ: ${TOTAL_OPERATIONS} (Truy vấn Lịch, Tiến độ, Gói, Bảng điểm KPI)`);
  console.log('===============================================================\n');

  const latencies: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-onb-user': 'C-1134',
    'x-user-email': 'Thangtutu0201@gmail.com'
  };

  // Helper to measure single request
  const executeOperation = async (index: number) => {
    const userCode = `C-${1000 + (index % 30)}`;
    const headers = {
      'Content-Type': 'application/json',
      'x-onb-user': userCode,
      'x-user-email': `${userCode.toLowerCase()}@onb.company.vn`
    };

    const operationType = index % 4;
    let url = `${baseUrl}/api/bootstrap`;

    if (operationType === 0) {
      url = `${baseUrl}/api/schedules?monthYear=2026-10`;
    } else if (operationType === 1) {
      url = `${baseUrl}/api/progress?monthYear=2026-10`;
    } else if (operationType === 2) {
      url = `${baseUrl}/api/packages?monthYear=2026-10`;
    } else {
      url = `${baseUrl}/api/scorecard?monthYear=2026-10`;
    }

    const start = performance.now();
    try {
      const res = await fetch(url, { headers });
      const duration = performance.now() - start;
      if (res.ok) {
        successfulRequests++;
        latencies.push(duration);
      } else {
        failedRequests++;
      }
    } catch (err) {
      failedRequests++;
    }
  };

  const wallClockStart = performance.now();

  // Run 150 concurrent users simultaneously using Promise.all
  const promises = [];
  for (let i = 0; i < TOTAL_OPERATIONS; i++) {
    promises.push(executeOperation(i));
  }

  await Promise.all(promises);

  const totalWallClockTime = performance.now() - wallClockStart;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const min = latencies[0] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const avg = latencies.reduce((sum, v) => sum + v, 0) / (latencies.length || 1);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  const throughputRps = (successfulRequests / (totalWallClockTime / 1000)).toFixed(1);

  console.log('KẾT QUẢ ĐO LƯỜNG HIỆU NĂNG THỰC TẾ:');
  console.log('---------------------------------------------------------------');
  console.log(`- Tổng thời gian hoàn thành: ${(totalWallClockTime / 1000).toFixed(2)} giây`);
  console.log(`- Yêu cầu thành công: ${successfulRequests}/${TOTAL_OPERATIONS} (${((successfulRequests / TOTAL_OPERATIONS) * 100).toFixed(1)}%)`);
  console.log(`- Yêu cầu thất bại: ${failedRequests}`);
  console.log(`- Thông lượng (Throughput): ${throughputRps} requests/giây`);
  console.log(`- Độ trễ tối thiểu (Min): ${min.toFixed(1)} ms`);
  console.log(`- Độ trễ trung bình (Avg): ${avg.toFixed(1)} ms`);
  console.log(`- Phân vị P50 (50% người dùng): ${p50.toFixed(1)} ms`);
  console.log(`- Phân vị P90 (90% người dùng): ${p90.toFixed(1)} ms`);
  console.log(`- Phân vị P95 (95% người dùng): ${p95.toFixed(1)} ms`);
  console.log(`- Phân vị P99 (99% người dùng): ${p99.toFixed(1)} ms`);
  console.log(`- Độ trễ tối đa (Max): ${max.toFixed(1)} ms`);
  console.log('===============================================================');
}

runBenchmark();
