---
title: MySql面试
date: 2023-04-02 15:22:42
tags:
---

# 1. B树和B+树之间的区别

> B树有些博客上会写成B-树，部分博客甚至读成了B减树，其实这个减号只是一个连接符，没有任何意义

[B-Tree Visualization (usfca.edu)](https://www.cs.usfca.edu/~galles/visualization/BTree.html)

[B+ Tree Visualization (usfca.edu)](https://www.cs.usfca.edu/~galles/visualization/BPlusTree.html)

B树和B+树的区别：

- B+树只会在叶子节点存储数据，而B树每个节点上都会有数据
- B+树每个叶子节点之间有一个指针乡相连

# 2. 高度为3的B+树能存多少条数据

[MySQL系列（4）— InnoDB数据页结构 - 掘金 (juejin.cn)](https://juejin.cn/post/6974225353371975693)

在InnoDB中，索引默认使用的数据结构为B+树，而B+树里的每个节点都是一个页，默认的页大小为`16KB`。

![page](https://5j9g3t.site/public/post/2023-3-0-fed73c7c-b6fb-40e4-9b27-1a95fccd77c8.webp)

# 3. 简单说一下InnoDB事务实现原理

事务ACID：

| 名称            | 别名   | 说明                                                         |
| --------------- | ------ | ------------------------------------------------------------ |
| **Atomicity**   | 原子性 | 原子性是指事务是一个不可分割的工作单位，事务中的操作要么都发生，要么都不发生 |
| **Consistency** | 一致性 | 事务前后数据的完整性必须保持一致                             |
| **Isolation**   | 隔离性 | 事务的隔离性是多个用户并发访问数据库时，数据库为每一个用户开启的事务，不能被其他事务的操作数据所干扰，多个并发事务之间要相互隔离 |
| **Durability**  | 持久性 | 持久性是指一个事务一旦被提交，它对数据库中数据的改变就是永久性的，接下来即使数据库发生故障也不应该对其有任何影响 |

[一文了解InnoDB事务实现原理 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/48327345)

上面那个比较深入，下面这个比较好理解一些：

[图解InnoDB事务实现原理｜Redo Log&Undo Log - 掘金 (juejin.cn)](https://juejin.cn/post/7012937835967692808)

# 4.MySql的三大日志是哪些

[MySQL三大日志(binlog,redolog,undolog)详解 - 掘金 (juejin.cn)](https://juejin.cn/post/7090530790156533773)

[聊聊MVCC和Next-key Locks - 掘金 (juejin.cn)](https://juejin.cn/post/6844903842505555981)

[细聊 MySQL undo log、redo log、binlog 有什么用？](https://www.cnblogs.com/xiaolincoding/p/16396502.html)

## redolog

redolog 记录的是物理日志。重做日志，用于 mysql 的崩溃恢复。在每次事务提交前，MySQL 都会将事务造成的修改记录成一小段数据，并将一小段输入写入缓冲流中，最后根据特定的策略决定什么时候将缓冲流写入到硬盘中。

`redolog` 在保存时，是以日志文件组的形式保存的，一个文件组中有多个文件，每个文件组合起来，构成一个类似环状链表的结构。在日志文件组中，分别由 `wirte pos` 和 `checkpoint` 保存相应的位置信息。`wirte pos` 主要保存当前 `redolog` 写到了哪里。`checkpoint` 则保存当前 `redolog` 执行到了哪里。

当`write pos` 追上 `checkpoint` 时，也就是 `redolog` 写满时，MySQL 会被阻塞，此时会停下来将 `Buffer Pool` 中的脏页刷新到磁盘中，然后标记 `redo log` 哪些记录可以被擦除，接着对旧的 `redo log` 记录进行擦除，等擦除完旧记录腾出了空间，`checkpoint` 就会往后移动，然后 MySQL 恢复正常运行，继续执行新的更新操作。

> [!NOTE]
> 所以，一次 checkpoint 的过程就是脏页刷新到磁盘中变成干净页，然后标记 redo log 哪些记录可以被覆盖的过程。


除了 redolog 满了，下面的情况也会触发 redolog 清理：

- 内存中的脏页百分比超过 `innodb_max_dirty_pages_pct`(默认为 75) 时
- 内存中的脏页百分比超过 `innodb_max_dirty_pages_pct_lwm`(默认为 0)时，为 0 时为保持脏页百分比在 `innodb_max_dirty_pages_pct`，当大于 0 时，脏页百分比超过该值后就会开始清理，当超过 `innodb_max_dirty_pages_pct` 时，就会用更快地速度清理。

## binlog

binlog 存储的是逻辑日志，它会记录 mysql 每次执行的 sql 语句。主要用于 mysql 节点之间的数据同步。binlog 会在事务执行过程中写入binlog cache中，并在事务提交后(发送 commit 命令后)刷新到操作系统的缓存中，之后根据不同的策略决定是否立即刷新操作系统的缓存。

### 两阶段提交

为了防止 binlog 和 redolog 数据不一致(redolog 刷盘了，binlog没刷)，binlog在提交时使用了两阶段提交。其实就是将 redo log 的写入拆成了两个步骤：prepare 和 commit，中间再穿插写入binlog，具体如下：

`prepare` 阶段(事务提交前)：将 `XID`（内部 `XA` 事务的 `ID`） 写入到 redo log，同时将 redo log 对应的事务状态设置为 prepare，然后将 redo log 刷新到硬盘；

commit 阶段：把 `XID` 写入到 binlog，然后将 binlog 刷新到磁盘，接着调用引擎的提交事务接口，将 redo log 状态设置为 commit（将事务设置为 commit 状态后，刷入到磁盘 redo log 文件，所以 commit 状态也是会刷盘的）；

### binlog 可以用于崩溃恢复吗

不可以，redolog 可以用于崩溃恢复的必要条件是**它拥有 write pos 和 checkpoint 这两个标识**，可以记录当前数据哪一段还没有被写入到硬盘中。而 binlog 没有这样的标识，只通过 binlog 无法得知某条数据是否已经写进了硬盘。

### binlog 可以干嘛

[The Binary Log](https://dev.mysql.com/doc/refman/5.7/en/binary-log.html)

在文档中提到，binlog 可以：

- 为主从同步数据
- [时间点恢复](https://dev.mysql.com/doc/refman/5.7/en/point-in-time-recovery.html)

这里主要是第二点，具体可以看文档操作：[Point-in-Time Recovery Using Binary Log](https://dev.mysql.com/doc/refman/5.7/en/point-in-time-recovery-binlog.html)。这个功能主要用于支持在数据库整个备份后，通过 binlog 实现增量备份，从而避免直接备份整个数据库。


# 5. MySql当前读和快照度

[mysql快照读原理实现 - 掘金 (juejin.cn)](https://juejin.cn/post/7055073479866974238)

[MySQL 的可重复读到底是怎么实现的？图解 ReadView 机制 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/166152616)

这里其实有个问题，如果我只是单独的一条查询语句，没有开启事务，那么怎么去快照读呢？

这个我自己查了一下，众所周知，MySql里有一个autocommit属性，对于单条SQL，这个值一定是true，那么是不是说明我们每条SQL都会被认作是一个事务呢？

然后我在官方文档里查了一下：

![每条SQL都是一个单独的事务](https://5j9g3t.site/public/interview/2023-2-0-bd1f976d-ac67-49a3-979b-1b9cd4fa2c6d.webp)

[MySQL :: MySQL 5.7 Reference Manual :: 14.7.2.2 autocommit, Commit, and Rollback](https://dev.mysql.com/doc/refman/5.7/en/innodb-autocommit-commit-rollback.html)

[MySQL :: MySQL 8.0 Reference Manual :: 15.7.2.2 autocommit, Commit, and Rollback](https://dev.mysql.com/doc/refman/8.0/en/innodb-autocommit-commit-rollback.html)

不管是8.0还是5.7，都是这样写的，那么就可以说的通了。每次执行单条SQL都会拿到一个事务id，然后再去进行快照读。

那么什么是当前读呢，使用下面的sql语句就是当前读：

```sql
# 加共享锁
SELECT ... LOCK IN SHARE MODE 
# 加排它锁
SELECT ... FROM UPDATE
```

这两条语句的原理就是给对应的行加上<font color=red>共享锁(读锁)或排它锁(写锁)</font>，当有事务进行增删改时也会加排它锁，对于共享锁，允许多个事务持有(即允许多读)，对于排它锁，则只允许一个事务持有(即只能一个人写，且除了自己其它人都不能读)。

在排它锁和共享锁下读的的数据就是当前读，这份数据永远是最新的(此时若有其它事务想要修改相关的行，都会被阻塞)。其它状况则就是快照读了，通过MVCC创建ReadView进行数据的读取。

# 6. MySql的MVCC

MVCC(Multiversion Concurrency Control)多版本并发控制。

首先在在MVCC下，每个表都会多出几个隐藏的列，分别为隐藏主键(row_id)、事务id(trx_id)、回滚指针(roll_pointer)。

MVCC还有两个重要的组成：undo log(回滚日志)、[ReadView](https://github.com/mysql/mysql-server/blob/61a3a1d8ef15512396b4c2af46e922a19bf2b174/storage/innobase/include/read0types.h#L48)。

ReadView 主要有下面几个字段:

| 字段名称             | 说明                                                              |   |
|------------------|-----------------------------------------------------------------|---|
| m_low_limit_id   | 当前系统中最小的未提交事务 ID                                |   |
| m_up_limit_id    | 生成 Read View 时，下一次将要分配的事务 ID                                       |   |
| m_creator_trx_id | 创建该 ReadView 的事务 id                                             |   |
| m_ids            | 当 ReadView 创建时，所有正在运行的事务id                                      |   |
| m_low_limit_no   | 事务不需要查看事务 id 小于该值的 undolog。小于该值的undolog如果不再被其它 ReadView需要，可以被清除 |   |


详细的生成规则：

- `m_low_limit_no`: 所有持久化完毕的、最大的事务 id (小于该 id 的事务已经全部持久化完成)

关于 `m_low_limit_id` 和 `m_up_limit_id`:

```
m_low_limit_id <= 活跃事务 < m_up_limit_id
```

还需要注意的一点是：

- 在 ReadCommitted 隔离级别下，每次查询都会创建新的 ReadView
- 在 RepeatableRead 隔离级别下，仅第一次查询会创建 ReadView，后续查询全部复用第一次创建的，这样就解决了幻读的问题 (虽然 RepeatableRead 在定义时没有解决幻读，但是在 mysql 的实现中，它就是解决了幻读的，相当于一个是接口，一个是实现)。

可见性判断：

1️⃣ trx_id < m_low_limit_id

👉 一定可见

- 说明：这个事务在你创建 Read View 前已经提交了

2️⃣ trx_id >= m_up_limit_id

👉 一定不可见

- 说明：这是你之后才开始的事务（未来的版本）

3️⃣ m_low_limit_id <= trx_id < m_up_limit_id

👉 看它是否在活跃事务列表中

在 active list 👉 ❌ 不可见（还没提交）

不在 👉 ✅ 可见（已提交）

---

其它引用:

- [判断可见性的源码](https://github.com/mysql/mysql-server/blob/61a3a1d8ef15512396b4c2af46e922a19bf2b174/storage/innobase/include/read0types.h#L163-L183)
- [代码实现 read0read.cc](https://github.com/mysql/mysql-server/blob/61a3a1d8ef15512396b4c2af46e922a19bf2b174/storage/innobase/read/read0read.cc)


# 7. RepeatableRead真的不能避免幻读吗?

[美团三面：一直追问我， MySQL 幻读被彻底解决了吗？_肥肥技术宅的博客-CSDN博客](https://blog.csdn.net/m0_71777195/article/details/126968432)

# 8. 为什么bin_log不能用作崩溃后的恢复

[mysql 为什么不能用binlog来做数据恢复？ - 知乎 (zhihu.com)](https://www.zhihu.com/question/463438061)
