---
title: 线程池
date: 2023-03-17 14:39:15
categories:
  data:
    - { name: "Java源码", path: "/2023/03/05/java-source/" }
tags:	
  data:
    - { name: 'Java', path: "/2023/03/05/java-source#Java"}
---

> [!NOTE]
> 本篇基于Java11

# 1. 构造器

线程池的构造器很多，我们直接看参数最多的那一个：


```java
public ThreadPoolExecutor(int corePoolSize,
                              int maximumPoolSize,
                              long keepAliveTime,
                              TimeUnit unit,
                              BlockingQueue<Runnable> workQueue,
                              ThreadFactory threadFactory,
                              RejectedExecutionHandler handler) {
    if (corePoolSize < 0 ||
        maximumPoolSize <= 0 ||
        maximumPoolSize < corePoolSize ||
        keepAliveTime < 0)
        throw new IllegalArgumentException();
    if (workQueue == null || threadFactory == null || handler == null)
        throw new NullPointerException();
    this.corePoolSize = corePoolSize;
    this.maximumPoolSize = maximumPoolSize;
    this.workQueue = workQueue;
    this.keepAliveTime = unit.toNanos(keepAliveTime);
    this.threadFactory = threadFactory;
    this.handler = handler;
}
```

- `corePoolSize`：线程池保存在线程池中的核心线程数，当线程数量超过该值后，将会回收多余的线程.
- `maximumPoolSize`：线程池最大的线程数
- `keepAliveTime`：当线程数大于`corePoolSize`时，多余的线程多久后被清除
- `unit`：`keepAliveTime`的时间单位
- `workQueue`：保存任务的工作队列
- `threadFactory`：要创建新线程时使用的工厂类
- `handler`：当任务由于超出线程池容量而被阻拦时将会执行此拦截器

线程池的基本工作流程如下：

1. 调用`execute`执行一个任务
2. 若工作线程数小于`corePoolSize`，则创建一个新的工作线程去执行这个任务
3. 若工作线程数已经大于等于`corePoolSize`，则将任务添加到工作队列中，工作线程执行完后会自动去执行队列中的任务
4. 若队列已满，则尝试增加工作线程去执行任务
5. 若工作线程数超过`maximumPoolSize`，则执行拒绝策略

## 1.1 拒绝策略

在`ThreadPoolExecutor`里有如下4个默认拒绝策略(`RejectedExecutionHandler`)。

- `CallerRunsPolicy`：如果线程池没有被关闭，则由当前线程执行(即提交任务的那个线程)
- `AbortPolicy`：直接抛出一个`RejectedExecutionException`
- `DiscardPolicy`：直接丢弃，并且没有任何提示
- `DiscardOldestPolicy`：丢弃任务队列中最早加入的一个任务，然后执行当前任务

其中`AbortPolicy`为构造器中缺省时的默认值。

## 1.2 工作队列

- `ArrayBlockingQueue`：一个基于数组结构的有界阻塞队列，此队列按 FIFO(先进先出)原则对元素进行排序。
- `LinkedBlockingQueue`：一个基于链表结构的无界阻塞队列，此队列按FIFO (先进先出) 排序元素，吞吐量通常要高于ArrayBlockingQueue。静态工厂方法Executors.newFixedThreadPool()使用了这个队列。
- `SynchronousQueue`：一个不存储元素的阻塞队列。每个插入操作必须等到另一个线程调用移除操作，否则插入操作一直处于阻塞状态，吞吐量通常要高于LinkedBlockingQueue，静态工厂方法Executors.newCachedThreadPool使用了这个队列。
- `PriorityBlockingQueue`：一个具有优先级的无限阻塞队列。

# 2. ctl

`ctl`是一个表示线程当前状态的原子整型：

```java
private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));
```

它的低29位为当前正在运行的线程数，高3位表示线程池的状态：

| 状态       | 源码             | 状态位 | 说明                                                         |
| ---------- | ---------------- | ------ | ------------------------------------------------------------ |
| RUNNING    | -1 << COUNT_BITS | 111    | 线程池正在正常运行                                           |
| SHUTDOWN   | 0 << COUNT_BITS  | 000    | 线程池准备关闭，此时拒绝新的任务，在所有任务执行完后进入TIDYING状态 |
| STOP       | 1 << COUNT_BITS  | 001    | 线程池准备关闭，此时会中断所有正在运行的线程，不再接收新任务，也不会执行已经在队列里的任务，工作线程数为0时进入TIDYING状态 |
| TIDYING    | 2 << COUNT_BITS  | 010    | 所有任务已经终止，进行整理状态                               |
| TERMINATED | 3 << COUNT_BITS  | 011    | 线程池彻底终止运行                                           |

> COUNT_BITS = Integer.SIZE - 3;

关闭线程池可以通过`shutdown()`或者`shutdownNow()`来分别进入`SHUTDOWN`或`STOP`状态

# 3. 执行任务

大致流程:

1. 线程数小于核心线程数，尝试创建新线程并执行任务
2. 若第一步创建失败，或者线程数大于等于核心线程数，则将任务添加到工作队列
3. 如果工作队列满了，则创建新的工作线程执行任务，直到线程数量达到最大值
4. 执行拒绝策略，拒绝任务执行

## 3.1 addWorker

```java
private boolean addWorker(Runnable firstTask, boolean core) {
    retry:
    for (int c = ctl.get();;) {
        // 检查ctl是否大于等于SHUTDOWN(常量，为0)，即判断是否进入了关闭状态
        if (runStateAtLeast(c, SHUTDOWN)
            // 检查ctl是否大于等于STOP(常量，1<<29)，大于等于STOP时时不再接收新任务
            && (runStateAtLeast(c, STOP)
                || firstTask != null
                || workQueue.isEmpty()))
            // 表示添加失败
            return false;

        for (;;) {
            // 判断当前正在工作的线程是否超出限制
            if (workerCountOf(c)
                >= ((core ? corePoolSize : maximumPoolSize) & COUNT_MASK))
                return false;
            // 将ctl自增，如果成功则结束最外层循环
            if (compareAndIncrementWorkerCount(c))
                break retry;
            c = ctl.get();  // Re-read ctl
            // 原子自增失败，判断是否进入关闭状态
            if (runStateAtLeast(c, SHUTDOWN))
                // 回到外层循环
                continue retry;
            // else CAS failed due to workerCount change; retry inner loop
        }
    }

    boolean workerStarted = false;
    boolean workerAdded = false;
    Worker w = null;
    try {
        w = new Worker(firstTask);
        // 这个Thread是根据ThreadFactory获取的
        final Thread t = w.thread;
        if (t != null) {
            // 加锁
            final ReentrantLock mainLock = this.mainLock;
            mainLock.lock();
            try {
                // Recheck while holding lock.
                // Back out on ThreadFactory failure or if
                // shut down before lock acquired.
                int c = ctl.get();

                if (isRunning(c) ||
                    // 判断当前状态是否为SHUTDOWN，并且任务为空
                    (runStateLessThan(c, STOP) && firstTask == null)) {
                    if (t.getState() != Thread.State.NEW)
                        throw new IllegalThreadStateException();
                    // 存到工作线程Set集合里
                    workers.add(w);
                    workerAdded = true;
                    int s = workers.size();
                    if (s > largestPoolSize)
                        largestPoolSize = s;
                }
            } finally {
                mainLock.unlock();
            }
            if (workerAdded) {
                // 启动任务
                t.start();
                workerStarted = true;
            }
        }
    } finally {
        if (! workerStarted)
            addWorkerFailed(w);
    }
    return workerStarted;
}
```

## 3.2 execute

```java
public void execute(Runnable command) {
    if (command == null)
        throw new NullPointerException();
	
    // ctl是一个原子整型，前3位为运行状态，后29位为运行中的线程数
    int c = ctl.get();
    // workerCountOf就是获取后29位
    if (workerCountOf(c) < corePoolSize) {
        if (addWorker(command, true))
            return;
        c = ctl.get();
    }
    // 走到这里，说明addWorker执行失败了，或者工作线程数大于等于了corePoolSize
    // 如果线程池还在运行，将任务添加到队列里
    if (isRunning(c) && workQueue.offer(command)) {
        int recheck = ctl.get();
        // 重新判断线程数是否停止了，如果是则移除这个任务
        if (!isRunning(recheck) && remove(command))
            reject(command);
        else if (workerCountOf(recheck) == 0)
            addWorker(null, false);
    }
    // 再次尝试添加
    else if (!addWorker(command, false))
        reject(command);
}
```

## 3.3 线程池是怎么运行的

其实把上面的代码看完可能还是不清楚线程池是怎么运作的，没事，还记得`addWorker`里调用了线程的`start`方法吗，我们来看一下：

```java
Worker w = null;
        try {
            w = new Worker(firstTask);
            final Thread t = w.thread;
            ...
       
            t.start();
```

来看一下worker类：

```java
private final class Worker
        extends AbstractQueuedSynchronizer
        implements Runnable
    {
    
    Worker(Runnable firstTask) {
        setState(-1); // inhibit interrupts until runWorker
        this.firstTask = firstTask;
        this.thread = getThreadFactory().newThread(this);
    }

    /** Delegates main run loop to outer runWorker. */
    public void run() {
        runWorker(this);
    }
}
```

可以发现线程调用`start`方法后实则运行的是`runWorker`，在看`runWorker`前先来看一下`getTask`方法：

先来看它的注释：

> Performs blocking or timed wait for a task, depending on current configuration settings, or returns null if this worker must exit because of any of: 1. There are more than maximumPoolSize workers (due to a call to setMaximumPoolSize). 2. The pool is stopped. 3. The pool is shutdown and the queue is empty. 4. This worker timed out waiting for a task, and timed-out workers are subject to termination (that is, allowCoreThreadTimeOut || workerCount > corePoolSize) both before and after the timed wait, and if the queue is non-empty, this worker is not the last thread in the pool.

大致意思是：执行阻塞或定时等待任务，当出现如下情况时返回null：

- 工作线程数超过`maximumPoolSize`
- 线程池关闭(调用`shutdownNow`方法)
- 线程池关闭，并且等待队列为空(调用`shutdown`方法)
- 该Worker超时等待一个任务

```java
private Runnable getTask() {
    boolean timedOut = false; // Did the last poll() time out?

    for (;;) {
        int c = ctl.get();

        // Check if queue empty only if necessary.
        // &&优先级高于||
        if (runStateAtLeast(c, SHUTDOWN)
            && (runStateAtLeast(c, STOP) || workQueue.isEmpty())) {
            decrementWorkerCount();
            return null;
        }

        int wc = workerCountOf(c);

        // Are workers subject to culling?
        // 允许常驻线程超时 || 线程数量是否大于核心线程数
        boolean timed = allowCoreThreadTimeOut || wc > corePoolSize;

        // 线程池线程数量超过最大值 || 当前线程开启计时并且超时
        if ((wc > maximumPoolSize || (timed && timedOut))
            && (wc > 1 || workQueue.isEmpty())) {
            // 删除worker
            if (compareAndDecrementWorkerCount(c))
                return null;
            continue;
        }

        try {
            // 这里都是进行阻塞，直到workQueue弹出一个元素
            Runnable r = timed ?
                workQueue.poll(keepAliveTime, TimeUnit.NANOSECONDS) :
            workQueue.take();
            if (r != null)
                return r;
            // 标记超时
            timedOut = true;
        } catch (InterruptedException retry) {
            timedOut = false;
        }
    }
}
```

然后再来看`runWorker`：

```java
final void runWorker(Worker w) {
    Thread wt = Thread.currentThread();
    Runnable task = w.firstTask;
    w.firstTask = null;
    w.unlock(); // allow interrupts
    boolean completedAbruptly = true;
    try {
        // 在这里执行任务或者获取任务，当没有新任务时这个worker就会被删掉
        while (task != null || (task = getTask()) != null) {
            // 加锁
            w.lock();
            // If pool is stopping, ensure thread is interrupted;
            // if not, ensure thread is not interrupted.  This
            // requires a recheck in second case to deal with
            // shutdownNow race while clearing interrupt
            // 上面的注释意思是：如果线程池被关闭(shutdownNow)，确保线程被中断，否则则确保没有被中断
            if ((runStateAtLeast(ctl.get(), STOP) || 
                 (Thread.interrupted() && runStateAtLeast(ctl.get(), STOP))) &&
                !wt.isInterrupted())
                wt.interrupt();
            try {
                // 这一步交给了子类实现
                beforeExecute(wt, task);
                try {
                    // 执行任务
                    task.run();
                    // 这一步同样交给了子类实现
                    afterExecute(task, null);
                } catch (Throwable ex) {
                    afterExecute(task, ex);
                    throw ex;
                }
            } finally {
                task = null;
                w.completedTasks++;
                w.unlock();
            }
        }
        completedAbruptly = false;
    } finally {
        processWorkerExit(w, completedAbruptly);
    }
}
```

## 3.4 为什么Worker要继承AQS

在`runWorker`里我们可以发现，我们是通过worker来加了锁的，这里为什么要加锁呢？我们一个worker不是只有一个线程吗？

其实这里在 `Worker` 类的注释上已经说明了:

```java
/**
 * Class Worker mainly maintains interrupt control state for
 * threads running tasks, along with other minor bookkeeping.
 * This class opportunistically extends AbstractQueuedSynchronizer
 * to simplify acquiring and releasing a lock surrounding each
 * task execution.  This protects against interrupts that are
 * intended to wake up a worker thread waiting for a task from
 * instead interrupting a task being run.  We implement a simple
 * non-reentrant mutual exclusion lock rather than use
 * ReentrantLock because we do not want worker tasks to be able to
 * reacquire the lock when they invoke pool control methods like
 * setCorePoolSize.  Additionally, to suppress interrupts until
 * the thread actually starts running tasks, we initialize lock
 * state to a negative value, and clear it upon start (in
 * runWorker).
 */
private final class Worker
    extends AbstractQueuedSynchronizer
    implements Runnable
{
```

首先这里需要知道，当 Worker 上锁了，就说明有任务正在执行，而这里用 AQS 可以防止：

1. 本来是用来唤醒正在等待任务的工作线程的中断，却意外地中断了正在运行的任务(用锁表示工作状态)。
2. 防止正在初始化的线程被中断，当 AQS 的 state 为 -1 时，表示正在初始化。
3. 避免 Worker 多次获取锁(Worker 的实现是非重入的)，导致在调用核心方法时例如 `setCorePoolSize` 造成了重入(当缩小核心线程数时，会尝试回收空闲的线程，此时会尝试获取锁，如果拿到了，说明线程空闲)。



# 4. mainLock

`mainLock`的注释如下：

> Lock held on access to workers set and related bookkeeping. While we could use a concurrent set of some sort, it turns out to be generally preferable to use a lock. Among the reasons is that this serializes interruptIdleWorkers, which avoids unnecessary interrupt storms, especially during shutdown. Otherwise exiting threads would concurrently interrupt those that have not yet interrupted. It also simplifies some of the associated statistics bookkeeping of largestPoolSize etc. We also hold mainLock on shutdown and shutdownNow, for the sake of ensuring workers set is stable while separately checking permission to interrupt and actually interrupting.

大致意思是：在访问Worker和一些其它计数变量时加锁。虽然可以用并发的集合来处理，但实际上使用锁更好。原因之一是*这些序列化的闲置线程将会避免一些无意义的中断风暴，特别是在关闭期间，另外在退出线程时将同时中断尚未中断的线程*((没读懂这句话，机翻的)。加锁还可以简化变量的相关记录。另外为了保证Worker的安全，应在退出时进行加锁。(~~翻译的稀碎，有能力建议自己翻译~~)

## 4.1 processWorkerExit

顾名思义，这个方法在Worker退出时会被调用

```java
private void processWorkerExit(Worker w, boolean completedAbruptly) {
    // 判断是否由于用户异常导致退出
    if (completedAbruptly) // If abrupt, then workerCount wasn't adjusted
        decrementWorkerCount();

    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        completedTaskCount += w.completedTasks;
        // 移除worker
        workers.remove(w);
    } finally {
        mainLock.unlock();
    }
	// 尝试将线程池从stop或shutdown转换为terminate状态
    tryTerminate();

    int c = ctl.get();
    // 判断是否不处于STOP状态
    if (runStateLessThan(c, STOP)) {
        // 如果不是由于用户异常导致
        if (!completedAbruptly) {
            int min = allowCoreThreadTimeOut ? 0 : corePoolSize;
            if (min == 0 && ! workQueue.isEmpty())
                min = 1;
            // 确保worker的数量最多有corePoolSize，超过了则不再新建
            if (workerCountOf(c) >= min)
                return; // replacement not needed
        }
        // 添加一个新Worker
        addWorker(null, false);
    }
}
```

# 5. 其它

与`ThreadPoolExecutor`一同作为线程池的还有`ForkJoinPool`。

[Java多线程之ThreadPoolExecutor和ForkJoinPool的用法 - 掘金 (juejin.cn)](https://juejin.cn/post/6844903870896799751)
